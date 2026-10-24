
ALTER FUNCTION public.is_genmerch_admin() SET search_path = '';
ALTER FUNCTION public.auto_confirm_new_customer() SET search_path = '';

-- Trigger functions should be invoked by their configured triggers, not as public RPC endpoints.
REVOKE EXECUTE ON FUNCTION public.auto_confirm_new_customer() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
