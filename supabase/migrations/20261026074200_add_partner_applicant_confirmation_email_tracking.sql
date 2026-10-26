-- Track the applicant-facing confirmation separately from the internal admin notification.
ALTER TABLE public.genmerch_partner_applications
  ADD COLUMN IF NOT EXISTS applicant_email_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS applicant_email_provider_message_id text,
  ADD COLUMN IF NOT EXISTS applicant_email_error text,
  ADD COLUMN IF NOT EXISTS applicant_email_sent_at timestamptz;

COMMENT ON COLUMN public.genmerch_partner_applications.applicant_email_status IS
  'Delivery submission status for the application confirmation email sent to the applicant.';
COMMENT ON COLUMN public.genmerch_partner_applications.applicant_email_provider_message_id IS
  'Email provider message identifier for the applicant confirmation.';
COMMENT ON COLUMN public.genmerch_partner_applications.applicant_email_error IS
  'Sanitized provider or transport error for the applicant confirmation attempt.';
COMMENT ON COLUMN public.genmerch_partner_applications.applicant_email_sent_at IS
  'Timestamp when the applicant confirmation was accepted by the email provider.';
