
-- Restrict execution of SECURITY DEFINER trigger functions (linter fix)
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
-- search_path already set via SET on handle_new_user; explicitly set for set_updated_at
alter function public.set_updated_at() set search_path = public;
