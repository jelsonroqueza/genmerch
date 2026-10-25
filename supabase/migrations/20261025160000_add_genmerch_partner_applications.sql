-- Store public GENMERCH partner applications privately and track notification status.
CREATE TABLE IF NOT EXISTS public.genmerch_partner_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
  business_name text NOT NULL DEFAULT '',
  email text NOT NULL CHECK (char_length(email) <= 254),
  phone text NOT NULL CHECK (char_length(phone) <= 40),
  location text NOT NULL CHECK (char_length(location) <= 160),
  partner_type text NOT NULL CHECK (partner_type IN ('Reseller', 'Wholesaler', 'Brand Affiliate')),
  business_stage text NOT NULL DEFAULT '',
  selling_channels text NOT NULL DEFAULT '',
  interested_products text NOT NULL DEFAULT '',
  estimated_monthly_orders text NOT NULL DEFAULT '',
  website_social text NOT NULL DEFAULT '',
  preferred_contact text NOT NULL DEFAULT 'Either' CHECK (preferred_contact IN ('Email', 'Phone', 'Either')),
  message text NOT NULL DEFAULT '',
  privacy_consent boolean NOT NULL DEFAULT false,
  ip_hash text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'contacted', 'approved', 'declined')),
  email_status text NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sending', 'accepted_by_resend', 'failed')),
  email_provider_message_id text,
  email_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  email_sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS genmerch_partner_applications_created_idx
  ON public.genmerch_partner_applications (created_at DESC);
CREATE INDEX IF NOT EXISTS genmerch_partner_applications_ip_rate_idx
  ON public.genmerch_partner_applications (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

ALTER TABLE public.genmerch_partner_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.genmerch_partner_applications FROM PUBLIC, anon, authenticated;
