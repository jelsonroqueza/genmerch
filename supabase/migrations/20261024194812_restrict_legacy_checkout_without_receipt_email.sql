-- Prevent direct legacy checkout calls that bypass the atomic receipt-email field.
-- The new 14-argument SECURITY DEFINER wrapper calls the old 13-argument function internally.
REVOKE ALL ON FUNCTION public.create_genmerch_order(uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
