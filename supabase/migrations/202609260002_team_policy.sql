-- Feature 8: safe workspace policy configuration only.
create function public.is_valid_workspace_policy(value jsonb) returns boolean
language sql immutable set search_path=public
as $$ select jsonb_typeof(value)='object'
 and (select count(*)=8 from jsonb_object_keys(value))
 and value ?& array['credentials','email','phone','internalIp','internalUrl','publicUrl','qr','metadata']
 and not exists(select 1 from jsonb_each_text(value) where value not in ('BLOCK','PROTECT','WARN','ALLOW')) $$;

create table public.workspace_policies (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 policy jsonb not null check(public.is_valid_workspace_policy(policy)),
 version bigint not null default 1 check(version > 0),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id)
);
alter table public.workspace_policies enable row level security;
create policy "members read team policy" on public.workspace_policies for select to authenticated using(public.is_workspace_member(workspace_id));

create function public.can_manage_workspace(target_workspace uuid) returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.workspace_members where workspace_id=target_workspace and user_id=auth.uid() and role in ('owner','admin')) $$;
revoke all on function public.can_manage_workspace(uuid) from public;
grant execute on function public.can_manage_workspace(uuid) to authenticated;

create function public.update_workspace_policy(target_workspace uuid,new_policy jsonb,expected_version bigint)
returns public.workspace_policies language plpgsql security definer set search_path=public as $$
declare result public.workspace_policies;
begin
 if not public.can_manage_workspace(target_workspace) then raise exception 'Not authorized'; end if;
 if not public.is_valid_workspace_policy(new_policy) then raise exception 'Invalid policy'; end if;
 update public.workspace_policies set policy=new_policy,version=version+1,updated_at=now(),updated_by=auth.uid()
 where workspace_id=target_workspace and version=expected_version returning * into result;
 if result.workspace_id is null then raise exception 'Policy version conflict'; end if;
 return result;
end $$;
revoke all on function public.update_workspace_policy(uuid,jsonb,bigint) from public;
grant execute on function public.update_workspace_policy(uuid,jsonb,bigint) to authenticated;

create function public.create_default_workspace_policy() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.workspace_policies(workspace_id,policy,updated_by) values(new.workspace_id,'{"credentials":"BLOCK","email":"PROTECT","phone":"PROTECT","internalIp":"PROTECT","internalUrl":"PROTECT","publicUrl":"ALLOW","qr":"WARN","metadata":"WARN"}'::jsonb,new.user_id) on conflict do nothing;return new;end $$;
create trigger workspace_owner_default_policy after insert on public.workspace_members for each row when(new.role='owner') execute procedure public.create_default_workspace_policy();
-- Backfill existing workspaces before Feature 8.
insert into public.workspace_policies(workspace_id,policy,updated_by)
select w.id,'{"credentials":"BLOCK","email":"PROTECT","phone":"PROTECT","internalIp":"PROTECT","internalUrl":"PROTECT","publicUrl":"ALLOW","qr":"WARN","metadata":"WARN"}'::jsonb,w.created_by from public.workspaces w on conflict do nothing;
