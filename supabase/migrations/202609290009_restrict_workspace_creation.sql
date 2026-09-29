-- Controlled private pilot: workspace provisioning is restricted to trusted operators.
-- The function remains defined for historical compatibility and controlled rollback.
revoke all on function public.create_workspace(text) from public;
revoke execute on function public.create_workspace(text) from anon, authenticated;