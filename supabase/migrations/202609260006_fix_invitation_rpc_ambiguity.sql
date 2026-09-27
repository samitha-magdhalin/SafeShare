-- Feature 10 live fix: remove PL/pgSQL output-variable and table-column ambiguity.
-- Migrations 004 and 005 are already applied; this migration replaces invitation RPC bodies only.

create or replace function public.invite_workspace_member(target_workspace uuid, invite_email text, invite_role text)
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
    select 1 from public.workspace_members as wm
    join auth.users as au on au.id=wm.user_id
    where wm.workspace_id=target_workspace and lower(trim(au.email))=normalized_email
  ) then raise exception 'INVITE_ALREADY_MEMBER'; end if;

  update public.workspace_invitations as wi
  set status='expired'
  where wi.workspace_id=target_workspace and wi.email=normalized_email
    and wi.status='pending' and wi.expires_at<=now();

  if exists(
    select 1 from public.workspace_invitations as wi
    where wi.workspace_id=target_workspace and wi.email=normalized_email and wi.status='pending'
  ) then raise exception 'INVITE_DUPLICATE'; end if;

  raw_token:=encode(gen_random_bytes(32),'hex');
  insert into public.workspace_invitations(workspace_id,email,role,token_digest,invited_by)
  values(target_workspace,normalized_email,invite_role,digest(raw_token,'sha256'),auth.uid())
  returning * into created;
  return query select created.id,raw_token,created.expires_at;
end $$;
revoke all on function public.invite_workspace_member(uuid,text,text) from public;
grant execute on function public.invite_workspace_member(uuid,text,text) to authenticated;

create or replace function public.list_workspace_invitations(target_workspace uuid)
returns table(id uuid,email text,role text,status text,created_at timestamptz,expires_at timestamptz)
language plpgsql security definer set search_path=public
as $$
declare caller_role text;
begin
  caller_role:=public.workspace_role(target_workspace);
  if caller_role not in ('owner','admin') then raise exception 'INVITE_NOT_AUTHORIZED'; end if;

  update public.workspace_invitations as wi
  set status='expired'
  where wi.workspace_id=target_workspace and wi.status='pending' and wi.expires_at<=now();

  return query
    select wi.id,wi.email,wi.role,wi.status,wi.created_at,wi.expires_at
    from public.workspace_invitations as wi
    where wi.workspace_id=target_workspace and (caller_role='owner' or wi.role='member')
    order by wi.created_at desc;
end $$;
revoke all on function public.list_workspace_invitations(uuid) from public;
grant execute on function public.list_workspace_invitations(uuid) to authenticated;

create or replace function public.revoke_workspace_invitation(target_invitation uuid) returns boolean
language plpgsql security definer set search_path=public
as $$
declare invitation public.workspace_invitations; caller_role text;
begin
  select wi.* into invitation
  from public.workspace_invitations as wi
  where wi.id=target_invitation
  for update;

  if invitation.id is null then raise exception 'INVITE_NOT_FOUND'; end if;
  caller_role:=public.workspace_role(invitation.workspace_id);
  if caller_role<>'owner' and not(caller_role='admin' and invitation.role='member') then
    raise exception 'INVITE_NOT_AUTHORIZED';
  end if;
  if invitation.status<>'pending' or invitation.expires_at<=now() then raise exception 'INVITE_NOT_PENDING'; end if;

  update public.workspace_invitations as wi
  set status='revoked',revoked_at=now()
  where wi.id=target_invitation;
  return true;
end $$;
revoke all on function public.revoke_workspace_invitation(uuid) from public;
grant execute on function public.revoke_workspace_invitation(uuid) to authenticated;

create or replace function public.accept_workspace_invitation(invite_token text)
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

  select lower(trim(au.email)),au.email_confirmed_at
  into account_email,account_confirmed
  from auth.users as au
  where au.id=auth.uid();
  if account_email is null or account_confirmed is null then raise exception 'INVITE_EMAIL_UNCONFIRMED'; end if;

  select wi.* into invitation
  from public.workspace_invitations as wi
  where wi.token_digest=digest(invite_token,'sha256')
  for update;

  if invitation.id is null then raise exception 'INVITE_INVALID'; end if;
  if invitation.status='revoked' then raise exception 'INVITE_REVOKED'; end if;
  if invitation.status='accepted' then raise exception 'INVITE_ACCEPTED'; end if;
  if invitation.status='expired' or invitation.expires_at<=now() then raise exception 'INVITE_EXPIRED'; end if;
  if invitation.status<>'pending' then raise exception 'INVITE_INVALID'; end if;
  if account_email<>invitation.email then raise exception 'INVITE_WRONG_ACCOUNT'; end if;

  insert into public.workspace_members(workspace_id,user_id,role)
  values(invitation.workspace_id,auth.uid(),invitation.role)
  on conflict(workspace_id,user_id) do nothing;

  select wm.role into membership_role
  from public.workspace_members as wm
  where wm.workspace_id=invitation.workspace_id and wm.user_id=auth.uid();

  update public.workspace_invitations as wi
  set status='accepted',accepted_at=now(),accepted_by=auth.uid()
  where wi.id=invitation.id;

  return query
    select w.id,w.name,w.created_by,membership_role
    from public.workspaces as w
    where w.id=invitation.workspace_id;
end $$;
revoke all on function public.accept_workspace_invitation(text) from public;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
