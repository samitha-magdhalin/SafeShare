-- Feature 10 live fix: make the roster RPC return type match its declared schema.
-- auth.users.email is varchar; RETURN QUERY requires an explicit cast to the declared text column.
create or replace function public.list_workspace_members(target_workspace uuid)
returns table(user_id uuid,display_name text,email text,role text,created_at timestamptz)
language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_workspace_member(target_workspace) then raise exception 'Not authorized'; end if;
  return query
    select wm.user_id,p.display_name,au.email::text,wm.role,wm.created_at
    from public.workspace_members wm
    left join public.profiles p on p.id=wm.user_id
    join auth.users au on au.id=wm.user_id
    where wm.workspace_id=target_workspace
    order by wm.created_at;
end $$;
revoke all on function public.list_workspace_members(uuid) from public;
grant execute on function public.list_workspace_members(uuid) to authenticated;
