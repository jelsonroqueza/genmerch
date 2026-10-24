# GENMERCH Order Confirmation Email Setup

The storefront calls the Supabase Edge Function `send-genmerch-order-confirmation` after an order is saved. The function builds a branded **GENMERCH - Suot Apparel** order email and sends it with Resend.

## One-time provider setup

1. Create a Resend account at https://resend.com/ and add a domain that GENMERCH is authorized to send from.
2. Follow Resend's DNS instructions and wait until the domain is verified. A sender such as `orders@YOUR-VERIFIED-DOMAIN` must use the verified domain.
3. Create a **sending-only** Resend API key. Do not put the key in the HTML, GitHub, README, or a chat message.
4. Open the Supabase project **GENMERCH - Suot Apparel** and go to **Edge Functions → Secrets**:
   https://supabase.com/dashboard/project/csbaxyzfcaxhyyzxfxjw/functions/secrets
5. Add these two secrets, using your own real values:

   - `RESEND_API_KEY` = the Resend API key
   - `GENMERCH_EMAIL_FROM` = `GENMERCH - Suot Apparel <orders@YOUR-VERIFIED-DOMAIN>`

   Replace the example sender address with an address on your verified domain. Do not include angle brackets around the API key.

Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into Edge Functions. Do not add or expose those values in storefront code.

## What the system does

- Uses the signed-in GENMERCH email as the default receipt recipient. The customer can edit the recipient email at checkout; guest customers must provide one.
- Saves the selected recipient on the order.
- Sends the order number, order date, items/variants/quantities, delivery address, subtotal, shipping fee, total, payment method/status, and important payment instructions.
- Records an email send result and prevents repeated successful sends for the same order.
- Does not mark payment as paid or change the order/delivery status.
- If sending fails or provider settings are missing, the order remains placed and the confirmation screen tells the customer to take a screenshot and keep the order number.

## Test checklist after configuring secrets

1. Place one low-value test order.
2. Confirm the success screen says the email was sent to the intended recipient.
3. Check Inbox and Spam/Junk.
4. Verify the email brand, order number, products, total, delivery address, and payment wording.
5. Confirm the order still shows its real payment status in GENMERCH; an order email is not a payment receipt.

## Security notes

- Only the Supabase Edge Function uses the Resend API key.
- The email endpoint verifies the order ID, order number, and checkout mobile number before preparing the email.
- The notification table is unavailable to anonymous and authenticated storefront clients.
