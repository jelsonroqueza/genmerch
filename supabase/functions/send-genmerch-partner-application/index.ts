import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ALLOWED_ORIGINS = new Set([
  "https://shopgenmerch.com",
  "https://www.shopgenmerch.com",
  "https://jelsonroqueza.github.io",
  "https://genmerch.netlify.app",
]);
const RECIPIENT = "negosyonipinoy@yahoo.com.ph";

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://shopgenmerch.com";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function respond(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
function text(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}
function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c] ?? c);
}
async function hashIp(ip: string, secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(ip + ":" + secret);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function row(label: string, value: string): string {
  return "<tr><th align=\"left\" valign=\"top\" style=\"padding:10px 12px;border-bottom:1px solid #f1e5df;background:#fff8f4;width:205px\">" +
    escapeHtml(label) + "</th><td style=\"padding:10px 12px;border-bottom:1px solid #f1e5df;white-space:pre-wrap\">" +
    escapeHtml(value || "Not provided") + "</td></tr>";
}
function buildHtml(application: Record<string, string>, reference: string, submittedAt: string): string {
  const rows = [
    row("Application reference", reference),
    row("Submitted on (Philippine time)", submittedAt),
    row("Full name", application.full_name),
    row("Business / brand name", application.business_name),
    row("Email address", application.email),
    row("Mobile number", application.phone),
    row("City / province", application.location),
    row("Partnership type", application.partner_type),
    row("Business stage", application.business_stage),
    row("Current selling channels", application.selling_channels),
    row("Products of interest", application.interested_products),
    row("Estimated monthly order volume", application.estimated_monthly_orders),
    row("Website / social media", application.website_social),
    row("Preferred contact method", application.preferred_contact),
    row("Additional details", application.message),
    row("Privacy consent", "Applicant agreed to the privacy notice."),
  ].join("");
  return `<!doctype html><html><body style="margin:0;background:#fbf7f3;font-family:Arial,Helvetica,sans-serif;color:#2d211d">
    <div style="max-width:760px;margin:24px auto;background:#fff;border:1px solid #f0ddd3;border-radius:14px;overflow:hidden">
      <div style="padding:20px 24px;background:linear-gradient(110deg,#ff3218,#ff551b);color:#fff">
        <div style="font-size:12px;letter-spacing:2px;font-weight:800">GENMERCH — SUOT APPAREL</div>
        <h1 style="font-size:23px;margin:9px 0 4px">New Partner Application</h1>
        <p style="margin:0;font-size:14px">A customer has submitted a partnership inquiry through the official storefront.</p>
      </div>
      <div style="padding:20px 24px">
        <p style="line-height:1.6">Review the applicant's details below. You can reply directly to this email thread to contact the applicant at <strong>${escapeHtml(application.email)}</strong>.</p>
        <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
        <p style="font-size:12px;color:#79685f;line-height:1.5;margin-top:18px">This message was generated automatically by the GENMERCH Partner With Us form. Application details are stored in the private GENMERCH database for follow-up.</p>
      </div>
    </div>
  </body></html>`;
}
function buildText(application: Record<string, string>, reference: string, submittedAt: string): string {
  return [
    "NEW GENMERCH PARTNER APPLICATION",
    "Reference: " + reference,
    "Submitted (Philippine time): " + submittedAt,
    "",
    "Full name: " + application.full_name,
    "Business / brand name: " + (application.business_name || "Not provided"),
    "Email address: " + application.email,
    "Mobile number: " + application.phone,
    "City / province: " + application.location,
    "Partnership type: " + application.partner_type,
    "Business stage: " + (application.business_stage || "Not provided"),
    "Current selling channels: " + (application.selling_channels || "Not provided"),
    "Products of interest: " + (application.interested_products || "Not provided"),
    "Estimated monthly order volume: " + (application.estimated_monthly_orders || "Not provided"),
    "Website / social media: " + (application.website_social || "Not provided"),
    "Preferred contact method: " + application.preferred_contact,
    "Additional details: " + (application.message || "Not provided"),
    "Privacy consent: Yes",
  ].join("\n");
}


function buildApplicantConfirmationHtml(application: Record<string, string>, reference: string, submittedAt: string): string {
  const name = escapeHtml(application.full_name);
  const ref = escapeHtml(reference);
  const partnerType = escapeHtml(application.partner_type);
  const businessName = escapeHtml(application.business_name || "Not provided");
  const date = escapeHtml(submittedAt);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#fbf7f3;font-family:Arial,Helvetica,sans-serif;color:#2d211d">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0">GENMERCH has received your Partner With Us application.</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf7f3;padding:26px 10px"><tr><td align="center">
        <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fff;border:1px solid #f0ddd3;border-radius:14px;overflow:hidden">
          <tr><td style="padding:25px 28px;background:#ff3218;color:#fff">
            <div style="font-size:12px;letter-spacing:2px;font-weight:800">GENMERCH — SUOT APPAREL</div>
            <h1 style="font-size:24px;line-height:1.25;margin:10px 0 5px">We received your application!</h1>
            <p style="margin:0;font-size:14px;line-height:1.5">Thank you for your interest in partnering with GENMERCH.</p>
          </td></tr>
          <tr><td style="padding:26px 28px">
            <p style="font-size:15px;line-height:1.7;margin:0 0 15px">Hi <strong>${name}</strong>,</p>
            <p style="font-size:14px;line-height:1.75;color:#5f524b;margin:0 0 18px">This email confirms that we have successfully received your Partner With Us application. Our team will review the details and contact you using your preferred contact method.</p>
            <div style="border:1px solid #f0dfd7;border-radius:10px;background:#fffaf7;padding:16px 18px;margin:18px 0">
              <div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#8a3a27;margin-bottom:9px">YOUR APPLICATION DETAILS</div>
              <p style="font-size:14px;line-height:1.65;margin:6px 0"><strong>Reference number:</strong><br><span style="word-break:break-word;color:#e52f17">${ref}</span></p>
              <p style="font-size:14px;line-height:1.65;margin:6px 0"><strong>Partnership type:</strong> ${partnerType}</p>
              <p style="font-size:14px;line-height:1.65;margin:6px 0"><strong>Business / brand name:</strong> ${businessName}</p>
              <p style="font-size:14px;line-height:1.65;margin:6px 0"><strong>Submitted on:</strong> ${date} (Philippine time)</p>
            </div>
            <h2 style="font-size:16px;color:#30241f;margin:22px 0 7px">What happens next?</h2>
            <p style="font-size:14px;line-height:1.75;color:#5f524b;margin:0 0 14px">We will review your application and contact you if we need more information. Please keep your reference number and check your inbox, including spam or junk folders.</p>
            <p style="font-size:13px;line-height:1.75;color:#5f524b;margin:0 0 18px"><strong>Please note:</strong> This confirms receipt only. It does not mean your application has been approved, and it does not guarantee a partnership, reseller pricing, or special terms.</p>
            <p style="font-size:14px;line-height:1.7;color:#5f524b;margin:0">Questions? Contact <a href="mailto:negosyonipinoy@yahoo.com.ph" style="color:#df2f18;font-weight:700">negosyonipinoy@yahoo.com.ph</a> and include your reference number.</p>
          </td></tr>
          <tr><td style="padding:16px 28px;background:#fff3ee;border-top:1px solid #f0dfd7;color:#79685f;font-size:11px;line-height:1.6">
            This is an automatic confirmation from the GENMERCH Partner With Us form.<br><a href="https://shopgenmerch.com/" style="color:#df2f18;font-weight:700">shopgenmerch.com</a> · GENMERCH — Suot Apparel
          </td></tr>
        </table>
      </td></tr></table>
    </body></html>`;
}

function buildApplicantConfirmationText(application: Record<string, string>, reference: string, submittedAt: string): string {
  return [
    "GENMERCH — SUOT APPAREL",
    "WE RECEIVED YOUR PARTNER APPLICATION",
    "",
    "Hi " + application.full_name + ",",
    "Thank you for your interest in partnering with GENMERCH. This email confirms that your Partner With Us application has been received.",
    "",
    "Application reference: " + reference,
    "Partnership type: " + application.partner_type,
    "Business / brand name: " + (application.business_name || "Not provided"),
    "Submitted on: " + submittedAt + " (Philippine time)",
    "",
    "What happens next?",
    "Our team will review your application and contact you using your preferred contact method. Please keep your reference number and check your inbox, including spam/junk folders.",
    "",
    "This is an acknowledgement of receipt only. It does not mean your application has been approved or guarantee a partnership, reseller pricing, or special terms.",
    "",
    "Questions? Email negosyonipinoy@yahoo.com.ph and include your reference number.",
    "https://shopgenmerch.com/",
  ].join("\n");
}

async function sendResendEmail(args: {
  apiKey: string;
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  textBody: string;
}): Promise<{ ok: boolean; messageId: string; error: string }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + args.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: args.from,
        to: [args.to],
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
        subject: args.subject,
        html: args.html,
        text: args.textBody,
      }),
    });
    let payload: Record<string, unknown> = {};
    try { payload = await response.json() as Record<string, unknown>; } catch { payload = {}; }
    if (!response.ok) {
      return { ok: false, messageId: "", error: text(payload.message || payload.error || ("Resend returned HTTP " + response.status), 1000) };
    }
    return { ok: true, messageId: text(payload.id, 180), error: "" };
  } catch (error) {
    return { ok: false, messageId: "", error: text(error, 1000) || "Email transport failed." };
  }
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response("Forbidden origin", { status: 403, headers: corsHeaders(null) });
  }
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return respond(405, { ok: false, message: "Use POST to submit a partner application." }, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const fromAddress = Deno.env.get("GENMERCH_EMAIL_FROM") || "";
  if (!supabaseUrl || !serviceRoleKey) return respond(503, { ok: false, message: "The application service is not configured." }, origin);
  if (!resendApiKey || !fromAddress) return respond(503, {
    ok: false,
    message: "The application notification email is not configured yet. Please use the partnership email shown on this page.",
  }, origin);

  let payload: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 16000) return respond(413, { ok: false, message: "The application is too large. Please shorten the additional details." }, origin);
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return respond(400, { ok: false, message: "Please submit the application form again." }, origin);
  }

  // Hidden honeypot field helps filter basic bot submissions without inconveniencing customers.
  if (text(payload.website, 300)) return respond(200, { ok: true, reference_id: "received" }, origin);

  const application: Record<string, string> = {
    full_name: text(payload.full_name, 120),
    business_name: text(payload.business_name, 160),
    email: text(payload.email, 254).toLowerCase(),
    phone: text(payload.phone, 40),
    location: text(payload.location, 160),
    partner_type: text(payload.partner_type, 40),
    business_stage: text(payload.business_stage, 80),
    selling_channels: text(payload.selling_channels, 120),
    interested_products: text(payload.interested_products, 120),
    estimated_monthly_orders: text(payload.estimated_monthly_orders, 80),
    website_social: text(payload.website_social, 240),
    preferred_contact: text(payload.preferred_contact, 20) || "Either",
    message: text(payload.message, 2500),
  };
  if (application.full_name.length < 2) return respond(400, { ok: false, message: "Enter your full name." }, origin);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email)) return respond(400, { ok: false, message: "Enter a valid email address." }, origin);
  const normalizedPhone = application.phone.replace(/[\s().-]/g, "");
  if (!/^(?:\+?63|0)?9\d{9}$/.test(normalizedPhone)) return respond(400, { ok: false, message: "Enter a valid Philippine mobile number, such as 09171234567." }, origin);
  if (application.location.length < 3) return respond(400, { ok: false, message: "Enter your city or municipality and province." }, origin);
  if (!["Reseller", "Wholesaler", "Brand Affiliate"].includes(application.partner_type)) {
    return respond(400, { ok: false, message: "Choose a partnership type." }, origin);
  }
  if (!["Email", "Phone", "Either"].includes(application.preferred_contact)) {
    return respond(400, { ok: false, message: "Choose a preferred contact method." }, origin);
  }
  if (payload.privacy_consent !== true) return respond(400, { ok: false, message: "Please agree to the privacy notice before submitting." }, origin);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const forwardedIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") ||
    (request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ipHash = forwardedIp ? await hashIp(forwardedIp, serviceRoleKey) : null;
  if (ipHash) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const rate = await admin.from("genmerch_partner_applications").select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash).gte("created_at", since);
    if (rate.error) {
      console.error("Partner application rate-limit lookup failed.");
      return respond(503, { ok: false, message: "We could not accept the application right now. Please retry in a few minutes." }, origin);
    }
    if ((rate.count || 0) >= 5) return respond(429, {
      ok: false,
      message: "Too many applications were submitted from this connection. Please try again later or email us directly.",
    }, origin);
  }

  const submittedAt = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short",
  }).format(new Date());
  const insert = await admin.from("genmerch_partner_applications").insert({
    ...application,
    privacy_consent: true,
    ip_hash: ipHash,
    status: "new",
    email_status: "sending",
    applicant_email_status: "sending",
  }).select("id").single();
  if (insert.error || !insert.data?.id) {
    console.error("Partner application could not be stored.", insert.error?.message || "missing row");
    return respond(500, { ok: false, message: "We could not save your application. Please try again or email us directly." }, origin);
  }

  const reference = String(insert.data.id).toUpperCase();
  const shortReference = reference.slice(0, 8);
  const [adminEmailResult, applicantEmailResult] = await Promise.all([
    sendResendEmail({
      apiKey: resendApiKey,
      from: fromAddress,
      to: RECIPIENT,
      replyTo: application.email,
      subject: "New GENMERCH Partner Application — " + application.partner_type + " — " + application.full_name,
      html: buildHtml(application, reference, submittedAt),
      textBody: buildText(application, reference, submittedAt),
    }),
    sendResendEmail({
      apiKey: resendApiKey,
      from: fromAddress,
      to: application.email,
      replyTo: RECIPIENT,
      subject: "We received your GENMERCH Partner Application — " + shortReference,
      html: buildApplicantConfirmationHtml(application, reference, submittedAt),
      textBody: buildApplicantConfirmationText(application, reference, submittedAt),
    }),
  ]);

  const updatedAt = new Date().toISOString();
  const update = await admin.from("genmerch_partner_applications").update({
    email_status: adminEmailResult.ok ? "accepted_by_resend" : "failed",
    email_provider_message_id: adminEmailResult.messageId || null,
    email_error: adminEmailResult.ok ? null : (adminEmailResult.error || "Email provider rejected the admin notification."),
    email_sent_at: adminEmailResult.ok ? updatedAt : null,
    applicant_email_status: applicantEmailResult.ok ? "accepted_by_resend" : "failed",
    applicant_email_provider_message_id: applicantEmailResult.messageId || null,
    applicant_email_error: applicantEmailResult.ok ? null : (applicantEmailResult.error || "Email provider rejected the applicant confirmation."),
    applicant_email_sent_at: applicantEmailResult.ok ? updatedAt : null,
  }).eq("id", insert.data.id);
  if (update.error) console.error("Partner application email statuses could not be persisted.");
  if (!adminEmailResult.ok) console.error("GENMERCH admin partner notification could not be sent.");
  if (!applicantEmailResult.ok) console.error("GENMERCH applicant confirmation could not be sent.");

  return respond(200, {
    ok: true,
    reference_id: reference,
    admin_notification_status: adminEmailResult.ok ? "accepted_by_resend" : "failed",
    applicant_email_status: applicantEmailResult.ok ? "accepted_by_resend" : "failed",
    message: applicantEmailResult.ok
      ? "Your application has been submitted successfully. A confirmation email has been accepted for sending to your email address."
      : "Your application was received and saved, but we could not send the confirmation email. Please check your spam folder or contact negosyonipinoy@yahoo.com.ph with reference " + reference + ". You do not need to submit another application.",
  }, origin);
});
