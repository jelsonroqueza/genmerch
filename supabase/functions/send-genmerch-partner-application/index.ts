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
  }).select("id").single();
  if (insert.error || !insert.data?.id) {
    console.error("Partner application could not be stored.", insert.error?.message || "missing row");
    return respond(500, { ok: false, message: "We could not save your application. Please try again or email us directly." }, origin);
  }

  const reference = String(insert.data.id).toUpperCase();
  let response: Response;
  let providerPayload: Record<string, unknown> = {};
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + resendApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress,
        to: [RECIPIENT],
        reply_to: application.email,
        subject: "New GENMERCH Partner Application — " + application.partner_type + " — " + application.full_name,
        html: buildHtml(application, reference, submittedAt),
        text: buildText(application, reference, submittedAt),
      }),
    });
    try { providerPayload = await response.json(); } catch { providerPayload = {}; }
  } catch (error) {
    await admin.from("genmerch_partner_applications").update({
      email_status: "failed",
      email_error: String(error).slice(0, 1000),
    }).eq("id", insert.data.id);
    console.error("Partner application email transport failed.");
    return respond(502, {
      ok: false,
      reference_id: reference,
      message: "Your application was saved, but the email notification could not be sent. Please email negosyonipinoy@yahoo.com.ph and include reference " + reference + ".",
    }, origin);
  }

  if (!response.ok) {
    const providerMessage = text((providerPayload as Record<string, unknown>).message || (providerPayload as Record<string, unknown>).error, 800);
    await admin.from("genmerch_partner_applications").update({
      email_status: "failed",
      email_error: providerMessage || "Email provider rejected the request.",
    }).eq("id", insert.data.id);
    console.error("Resend rejected partner application email.", response.status);
    return respond(502, {
      ok: false,
      reference_id: reference,
      message: "Your application was saved, but the email notification could not be sent. Please email negosyonipinoy@yahoo.com.ph and include reference " + reference + ".",
    }, origin);
  }

  const providerId = text(providerPayload.id, 180);
  const update = await admin.from("genmerch_partner_applications").update({
    email_status: "accepted_by_resend",
    email_provider_message_id: providerId || null,
    email_error: null,
    email_sent_at: new Date().toISOString(),
  }).eq("id", insert.data.id);
  if (update.error) console.error("Partner application was emailed but notification status could not be updated.");

  return respond(200, {
    ok: true,
    reference_id: reference,
    delivery_status: "accepted_by_resend",
    message: "Your application has been submitted successfully.",
  }, origin);
});
