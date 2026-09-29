-- Reassert Team Policy mutation authorization after live member-account validation.
-- Members retain SELECT access through the existing RLS policy. Mutations remain RPC-only.
create or replace function public.can_manage_workspace(target_workspace uuid) returns boolean
language sql stable security definer set search_path=public
as $$
  select auth.uid() is not null and exists(
    select 1
    from public.workspace_members as wm
    where wm.workspace_id=target_workspace
      and wm.user_id=auth.uid()
      and wm.role in ('owner','admin')
  )
$$;
revoke all on function public.can_manage_workspace(uuid) from public;
grant execute on function public.can_manage_workspace(uuid) to authenticated;

create or replace function public.update_workspace_policy(target_workspace uuid,new_policy jsonb,expected_version bigint)
returns public.workspace_policies
language plpgsql security definer set search_path=public
as $$
declare
  result public.workspace_policies;
begin
  if auth.uid() is null or not exists(
    select 1
    from public.workspace_members as wm
    where wm.workspace_id=target_workspace
      and wm.user_id=auth.uid()
      and wm.role in ('owner','admin')
  ) then
    raise exception 'POLICY_NOT_AUTHORIZED';
  end if;
  if not public.is_valid_workspace_policy(new_policy) then
    raise exception 'Invalid policy';
  end if;
  update public.workspace_policies as wp
  set policy=new_policy,version=wp.version+1,updated_at=now(),updated_by=auth.uid()
  where wp.workspace_id=target_workspace and wp.version=expected_version
  returning wp.* into result;
  if result.workspace_id is null then
    raise exception 'Policy version conflict';
  end if;
  return result;
end
$$;
revoke all on function public.update_workspace_policy(uuid,jsonb,bigint) from public;
grant execute on function public.update_workspace_policy(uuid,jsonb,bigint) to authenticated;

revoke insert,update,delete on public.workspace_policies from anon,authenticated;