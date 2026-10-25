-- Only the Supabase Edge Function's service role can read or manage partner applications.
-- Public and signed-in customer roles continue to have no direct table access.
GRANT SELECT, INSERT, UPDATE ON TABLE public.genmerch_partner_applications TO service_role;
REVOKE ALL ON TABLE public.genmerch_partner_applications FROM PUBLIC, anon, authenticated;
