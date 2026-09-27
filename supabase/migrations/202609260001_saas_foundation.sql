-- SafeShare Feature 7A control plane only. No screenshot, OCR, finding, or image data is stored.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  created_at timestamptz not null default now()
);
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);
create index workspace_members_user_id_idx on public.workspace_members(user_id);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create function public.is_workspace_member(target_workspace uuid) returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.workspace_members where workspace_id=target_workspace and user_id=auth.uid()) $$;
revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

create policy "read own profile" on public.profiles for select to authenticated using (id=auth.uid());
create policy "update own profile" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy "members read workspace" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy "members read memberships" on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));

create function public.create_workspace(workspace_name text)
returns table(id uuid,name text,created_by uuid)
language plpgsql security definer set search_path=public
as $$
declare created public.workspaces;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(workspace_name)) not between 2 and 80 then raise exception 'Invalid workspace name'; end if;
  insert into public.workspaces(name,created_by) values(trim(workspace_name),auth.uid()) returning * into created;
  insert into public.workspace_members(workspace_id,user_id,role) values(created.id,auth.uid(),'owner');
  return query select created.id,created.name,created.created_by;
end $$;
revoke all on function public.create_workspace(text) from public;
grant execute on function public.create_workspace(text) to authenticated;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public
as $$ begin insert into public.profiles(id,display_name) values(new.id,nullif(trim(new.raw_user_meta_data->>'display_name'),'')); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
