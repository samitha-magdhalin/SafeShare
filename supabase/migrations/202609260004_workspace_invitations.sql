-- Feature 10: company workspace invitations for a private pilot.
-- Stores administrative account email and token digests only. No screenshot data belongs here.
create extension if not exists pgcrypto;

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','member')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  token_digest bytea not null unique,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  check (email = lower(trim(email)) and char_length(email) between 3 and 320),
  check (expires_at > created_at),
  check ((status='accepted' and accepted_at is not null and accepted_by is not null) or status<>'accepted'),
  check ((status='revoked' and revoked_at is not null) or status<>'revoked')
);
create unique index workspace_invitations_pending_email_idx
  on public.workspace_invitations(workspace_id,email) where status='pending';
create index workspace_invitations_workspace_created_idx
  on public.workspace_invitations(workspace_id,created_at desc);
create index workspace_invitations_expiry_idx
  on public.workspace_invitations(expires_at) where status='pending';

alter table public.workspace_invitations enable row level security;
revoke insert,update,delete on public.workspace_invitations from anon,authenticated;

create function public.workspace_role(target_workspace uuid) returns text
language sql stable security definer set search_path=public
as $$ select role from public.workspace_members where workspace_id=target_workspace and user_id=auth.uid() $$;
revoke all on function public.workspace_role(uuid) from public;
grant execute on function public.workspace_role(uuid) to authenticated;

-- Table reads remain explicit and scoped. All writes use the RPCs below.
create policy "owners read workspace invitations" on public.workspace_invitations
for select to authenticated using (public.workspace_role(workspace_id)='owner');
create policy "admins read member invitations" on public.workspace_invitations
for select to authenticated using (public.workspace_role(workspace_id)='admin' and role='member');

create function public.invite_workspace_member(target_workspace uuid, invite_email text, invite_role text)
returns table(invitation_id uuid, invite_token text, expires_at timestamptz)
language plpgsql security definer set search_path=public
as $$
declare
  caller_role text;
  normalized_email text;
  raw_token text;
  created public.workspace_invitations;
begin
  if auth.uid() is null then raise exception 'INVITE_AUTH_REQUIRED'; end if;
  caller_role:=public.workspace_role(target_workspace);
  if caller_role not in ('owner','admin') then raise exception 'INVITE_NOT_AUTHORIZED'; end if;
  if invite_role not in ('admin','member') then raise exception 'INVITE_INVALID_ROLE'; end if;
  if caller_role='admin' and invite_role<>'member' then raise exception 'INVITE_NOT_AUTHORIZED'; end if;
  normalized_email:=lower(trim(invite_email));
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or char_length(normalized_email)>320 then
    raise exception 'INVITE_INVALID_EMAIL';
  end if;
  if exists(
    select 1 from public.workspace_members wm
    join auth.users au on au.id=wm.user_id
    where wm.workspace_id=target_workspace and lower(trim(au.email))=normalized_email
  ) then raise exception 'INVITE_ALREADY_MEMBER'; end if;

  update public.workspace_invitations
  set status='expired'
  where workspace_id=target_workspace and email=normalized_email and status='pending' and expires_at<=now();

  if exists(select 1 from public.workspace_invitations where workspace_id=target_workspace and email=normalized_email and status='pending')
    then raise exception 'INVITE_DUPLICATE'; end if;

  raw_token:=encode(gen_random_bytes(32),'hex');
  insert into public.workspace_invitations(workspace_id,email,role,token_digest,invited_by)
  values(target_workspace,normalized_email,invite_role,digest(raw_token,'sha256'),auth.uid())
  returning * into created;
  return query select created.id,raw_token,created.expires_at;
end $$;
revoke all on function public.invite_workspace_member(uuid,text,text) from public;
grant execute on function public.invite_workspace_member(uuid,text,text) to authenticated;

create function public.list_workspace_invitations(target_workspace uuid)
returns table(id uuid,email text,role text,status text,created_at timestamptz,expires_at timestamptz)
language plpgsql security definer set search_path=public
as $$
declare caller_role text;
begin
  caller_role:=public.workspace_role(target_workspace);
  if caller_role not in ('owner','admin') then raise exception 'INVITE_NOT_AUTHORIZED'; end if;
  update public.workspace_invitations wi set status='expired'
    where wi.workspace_id=target_workspace and wi.status='pending' and wi.expires_at<=now();
  return query
    select wi.id,wi.email,wi.role,wi.status,wi.created_at,wi.expires_at
    from public.workspace_invitations wi
    where wi.workspace_id=target_workspace and (caller_role='owner' or wi.role='member')
    order by wi.created_at desc;
end $$;
revoke all on function public.list_workspace_invitations(uuid) from public;
grant execute on function public.list_workspace_invitations(uuid) to authenticated;

create function public.revoke_workspace_invitation(target_invitation uuid) returns boolean
language plpgsql security definer set search_path=public
as $$
declare invitation public.workspace_invitations; caller_role text;
begin
  select * into invitation from public.workspace_invitations where id=target_invitation for update;
  if invitation.id is null then raise exception 'INVITE_NOT_FOUND'; end if;
  caller_role:=public.workspace_role(invitation.workspace_id);
  if caller_role<>'owner' and not(caller_role='admin' and invitation.role='member') then
    raise exception 'INVITE_NOT_AUTHORIZED';
  end if;
  if invitation.status<>'pending' or invitation.expires_at<=now() then raise exception 'INVITE_NOT_PENDING'; end if;
  update public.workspace_invitations set status='revoked',revoked_at=now() where id=target_invitation;
  return true;
end $$;
revoke all on function public.revoke_workspace_invitation(uuid) from public;
grant execute on function public.revoke_workspace_invitation(uuid) to authenticated;

create function public.accept_workspace_invitation(invite_token text)
returns table(id uuid,name text,created_by uuid,role text)
language plpgsql security definer set search_path=public
as $$
declare
  invitation public.workspace_invitations;
  account_email text;
  account_confirmed timestamptz;
  membership_role text;
begin
  if auth.uid() is null then raise exception 'INVITE_AUTH_REQUIRED'; end if;
  if invite_token is null or invite_token !~ '^[0-9a-f]{64}$' then raise exception 'INVITE_INVALID'; end if;
  select lower(trim(email)),email_confirmed_at into account_email,account_confirmed from auth.users where id=auth.uid();
  if account_email is null or account_confirmed is null then raise exception 'INVITE_EMAIL_UNCONFIRMED'; end if;

  select * into invitation from public.workspace_invitations
  where token_digest=digest(invite_token,'sha256') for update;
  if invitation.id is null then raise exception 'INVITE_INVALID'; end if;
  if invitation.status='revoked' then raise exception 'INVITE_REVOKED'; end if;
  if invitation.status='accepted' then raise exception 'INVITE_ACCEPTED'; end if;
  if invitation.status='expired' or invitation.expires_at<=now() then raise exception 'INVITE_EXPIRED'; end if;
  if invitation.status<>'pending' then raise exception 'INVITE_INVALID'; end if;
  if account_email<>invitation.email then raise exception 'INVITE_WRONG_ACCOUNT'; end if;

  insert into public.workspace_members(workspace_id,user_id,role)
  values(invitation.workspace_id,auth.uid(),invitation.role)
  on conflict(workspace_id,user_id) do nothing;

  select wm.role into membership_role from public.workspace_members wm
    where wm.workspace_id=invitation.workspace_id and wm.user_id=auth.uid();
  update public.workspace_invitations
    set status='accepted',accepted_at=now(),accepted_by=auth.uid()
    where workspace_invitations.id=invitation.id;

  return query select w.id,w.name,w.created_by,membership_role
    from public.workspaces w where w.id=invitation.workspace_id;
end $$;
revoke all on function public.accept_workspace_invitation(text) from public;
grant execute on function public.accept_workspace_invitation(text) to authenticated;

-- Safe roster access without a browser-side auth.users query or fragile PostgREST relationship.
create function public.list_workspace_members(target_workspace uuid)
returns table(user_id uuid,display_name text,email text,role text,created_at timestamptz)
language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_workspace_member(target_workspace) then raise exception 'Not authorized'; end if;
  return query
    select wm.user_id,p.display_name,au.email,wm.role,wm.created_at
    from public.workspace_members wm
    left join public.profiles p on p.id=wm.user_id
    join auth.users au on au.id=wm.user_id
    where wm.workspace_id=target_workspace order by wm.created_at;
end $$;
revoke all on function public.list_workspace_members(uuid) from public;
grant execute on function public.list_workspace_members(uuid) to authenticated;
