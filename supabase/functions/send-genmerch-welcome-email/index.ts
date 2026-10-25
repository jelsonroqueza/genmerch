import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ALLOWED_ORIGINS = new Set([
  "https://shopgenmerch.com",
  "https://www.shopgenmerch.com",
  "https://jelsonroqueza.github.io",
]);

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://shopgenmerch.com",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function respond(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function buildWelcomeHtml(name: string, email: string): string {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f5f2f0;font-family:Arial,Helvetica,sans-serif;color:#29211d">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">Welcome to GENMERCH. Your account is ready.</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f2f0;padding:26px 10px"><tr><td align="center">' +
    '<table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fff;border:1px solid #ecdcd4;border-radius:14px;overflow:hidden">' +
    '<tr><td style="padding:26px 28px;background:#f32c16;color:#fff">' +
    '<div style="font-size:25px;line-height:1.2;font-weight:900;letter-spacing:-.4px">GENMERCH <span style="color:#ffe3dc">— Suot Apparel</span></div>' +
    '<div style="margin-top:7px;font-size:13px;line-height:1.5">Your everyday style. Your way.</div></td></tr>' +
    '<tr><td style="padding:28px">' +
    '<div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#e9f8ef;color:#18713d;font-size:11px;font-weight:800;letter-spacing:.5px">ACCOUNT CREATED</div>' +
    '<h1 style="margin:15px 0 10px;color:#29211d;font-size:25px;line-height:1.25">Welcome to GENMERCH, ' + safeName + '!</h1>' +
    '<p style="margin:0 0 18px;color:#6f625b;font-size:15px;line-height:1.7">We’re glad you’re here. Your GENMERCH customer account is ready, so you can explore our collection and manage your orders in one place.</p>' +
    '<div style="margin:20px 0;padding:17px 18px;border:1px solid #f0dfd7;border-radius:10px;background:#fffaf7">' +
    '<div style="font-size:14px;font-weight:800;color:#30241f">Make the most of your account</div>' +
    '<ul style="margin:11px 0 0;padding-left:19px;color:#6f625b;font-size:14px;line-height:1.85">' +
    '<li>Browse our apparel and new arrivals.</li><li>Review orders linked to your account.</li><li>Follow order status and available shipping details.</li><li>Check the storefront for promotions when available.</li></ul></div>' +
    '<table role="presentation" cellspacing="0" cellpadding="0" style="margin:23px 0"><tr><td style="border-radius:8px;background:#f32c16;text-align:center">' +
    '<a href="https://shopgenmerch.com/" style="display:inline-block;padding:13px 24px;color:#fff;text-decoration:none;font-size:14px;font-weight:900">Explore GENMERCH</a>' +
    '</td></tr></table>' +
    '<p style="margin:0 0 14px;color:#6f625b;font-size:13px;line-height:1.7">Account email: <strong style="color:#2d221d">' + safeEmail + '</strong></p>' +
    '<p style="margin:0;color:#6f625b;font-size:13px;line-height:1.7">Keep your password and verification codes private. GENMERCH will never ask you to send your password by email.</p>' +
    '<p style="margin:23px 0 0;color:#51433d;font-size:14px;line-height:1.7">Thank you for joining us. We appreciate your support and look forward to being part of your everyday style.<br><strong>The GENMERCH Team</strong></p>' +
    '</td></tr><tr><td style="padding:17px 28px;background:#fffaf7;border-top:1px solid #f0e5df;color:#8b7a70;font-size:12px;line-height:1.8">' +
    '<strong style="color:#58453b">GENMERCH — Suot Apparel</strong><br>' +
    '<a href="https://shopgenmerch.com/" style="color:#c92d1b">shopgenmerch.com</a><br>' +
    '<a href="mailto:negosyonipinoy@gmail.com" style="color:#c92d1b">negosyonipinoy@gmail.com</a> · <a href="tel:09750634497" style="color:#c92d1b">09750634497</a><br>' +
    'You received this service email because a GENMERCH account was created using this address.</td></tr></table></td></tr></table></body></html>';
}
function buildWelcomeText(name: string, email: string): string {
  return [
    "GENMERCH — Suot Apparel",
    "",
    "Welcome to GENMERCH, " + name + "!",
    "",
    "We’re glad you’re here. Your GENMERCH customer account is ready.",
    "",
    "MAKE THE MOST OF YOUR ACCOUNT",
    "- Browse our apparel and new arrivals.",
    "- Review orders linked to your account.",
    "- Follow order status and available shipping details.",
    "- Check the storefront for promotions when available.",
    "",
    "Explore GENMERCH: https://shopgenmerch.com/",
    "Account email: " + email,
    "",
    "Keep your password and verification codes private. GENMERCH will never ask you to send your password by email.",
    "",
    "Thank you for joining us. We appreciate your support and look forward to being part of your everyday style.",
    "The GENMERCH Team",
    "",
    "Customer support: negosyonipinoy@gmail.com | 09750634497",
  ].join("\n");
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response("Forbidden origin", { status: 403 });
  }
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return respond(405, { ok: false, code: "method_not_allowed" }, origin);
  }

  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return respond(401, { ok: false, code: "authentication_required", message: "Please sign in before requesting account welcome email." }, origin);
  }
  const token = authHeader.slice(7).trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return respond(500, { ok: false, code: "backend_not_configured", message: "Welcome email service backend is not configured." }, origin);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user || !user.id || !user.email) {
      return respond(401, { ok: false, code: "invalid_session", message: "Your sign-in session could not be verified." }, origin);
    }

    const createdAt = new Date(String(user.created_at || "")).getTime();
    const ageMs = Date.now() - createdAt;
    const welcomeWindowMs = 72 * 60 * 60 * 1000;
    if (!Number.isFinite(createdAt) || ageMs < -5 * 60 * 1000 || ageMs > welcomeWindowMs) {
      return respond(200, { ok: true, eligible: false, message: "Welcome emails are only sent shortly after an account is created." }, origin);
    }

    const recipient = String(user.email).trim().toLowerCase();
    const metadata = (user.user_metadata || {}) as Record<string, unknown>;
    const candidateName = String(metadata.full_name || metadata.name || metadata.first_name || "").trim();
    const fallbackName = recipient.split("@")[0].replace(/[._+-]+/g, " ").trim();
    const customerName = (candidateName || fallbackName || "there").slice(0, 100);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromAddress = Deno.env.get("GENMERCH_EMAIL_FROM");
    if (!resendApiKey || !fromAddress) {
      return respond(503, { ok: false, code: "email_provider_not_configured", message: "Welcome email cannot be sent because the email provider configuration is incomplete." }, origin);
    }

    let reservation: Record<string, unknown> | null = null;
    const insertResult = await admin.from("genmerch_welcome_email_notifications")
      .insert({ user_id: user.id, recipient_email: recipient, status: "sending" })
      .select("user_id,recipient_email,status,updated_at")
      .maybeSingle();

    if (!insertResult.error && insertResult.data) {
      reservation = insertResult.data as Record<string, unknown>;
    } else if (insertResult.error?.code === "23505") {
      const existingResult = await admin.from("genmerch_welcome_email_notifications")
        .select("user_id,recipient_email,status,updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (existingResult.error) {
        console.error("Could not read welcome email delivery state.", existingResult.error.message);
        return respond(500, { ok: false, code: "delivery_state_unavailable", message: "We could not confirm welcome email delivery status." }, origin);
      }
      const existing = existingResult.data as Record<string, unknown> | null;
      if (existing?.status === "sent") {
        return respond(200, { ok: true, already_sent: true, recipient_email: existing.recipient_email || recipient }, origin);
      }
      const existingUpdated = new Date(String(existing?.updated_at || existing?.created_at || "")).getTime();
      const canRetryFailed = existing?.status === "failed";
      const canRecoverStale = existing?.status === "sending" && Number.isFinite(existingUpdated) && Date.now() - existingUpdated > 10 * 60 * 1000;
      if (canRetryFailed || canRecoverStale) {
        let updateQuery = admin.from("genmerch_welcome_email_notifications")
          .update({ status: "sending", recipient_email: recipient, error_message: null, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
        updateQuery = canRetryFailed ? updateQuery.eq("status", "failed") : updateQuery.eq("status", "sending").lt("updated_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
        const claim = await updateQuery.select("user_id,recipient_email,status,updated_at").maybeSingle();
        if (claim.error) {
          console.error("Could not retry welcome email delivery.", claim.error.message);
          return respond(500, { ok: false, code: "delivery_retry_unavailable", message: "We could not retry the welcome email right now." }, origin);
        }
        if (claim.data) reservation = claim.data as Record<string, unknown>;
      }
      if (!reservation) {
        return respond(202, { ok: false, sending: true, message: "The welcome email is already being processed." }, origin);
      }
    } else {
      console.error("Could not reserve welcome email notification.", insertResult.error?.message || "Unknown database error");
      return respond(500, { ok: false, code: "delivery_state_unavailable", message: "We could not prepare the welcome email." }, origin);
    }

    let providerResponse: Response;
    let providerPayload: Record<string, unknown> = {};
    try {
      providerResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": "Bearer " + resendApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromAddress,
          to: [recipient],
          reply_to: "negosyonipinoy@gmail.com",
          subject: "Welcome to GENMERCH — Your Style Starts Here!",
          html: buildWelcomeHtml(customerName, recipient),
          text: buildWelcomeText(customerName, recipient),
        }),
      });
      try { providerPayload = await providerResponse.json(); } catch { providerPayload = {}; }
    } catch (error) {
      await admin.from("genmerch_welcome_email_notifications").update({
        status: "failed", error_message: String(error).slice(0, 1000), updated_at: new Date().toISOString(),
      }).eq("user_id", user.id);
      console.error("Resend connection failed for welcome email.", error instanceof Error ? error.message : "Unknown provider error");
      return respond(502, { ok: false, code: "email_provider_unreachable", message: "We could not send your welcome email right now. Your GENMERCH account remains available." }, origin);
    }

    if (!providerResponse.ok) {
      const providerError = String(providerPayload.message || providerPayload.name || ("Resend returned HTTP " + providerResponse.status)).slice(0, 1000);
      await admin.from("genmerch_welcome_email_notifications").update({
        status: "failed", error_message: providerError, updated_at: new Date().toISOString(),
      }).eq("user_id", user.id);
      console.error("Resend rejected a GENMERCH welcome email.", { status: providerResponse.status, error: providerError });
      return respond(502, { ok: false, code: "email_provider_rejected", message: "Your account was created, but the welcome email could not be sent. It can be retried after the email configuration is fixed." }, origin);
    }

    const providerMessageId = String(providerPayload.id || "");
    const finish = await admin.from("genmerch_welcome_email_notifications").update({
      status: "sent", provider_message_id: providerMessageId || null,
      error_message: null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("user_id", user.id).eq("status", "sending");
    if (finish.error) {
      console.error("Welcome email was accepted by Resend but database state update failed.", finish.error.message);
    }
    return respond(200, {
      ok: true,
      recipient_email: recipient,
      message_id: providerMessageId,
      delivery_status: "accepted_by_resend",
    }, origin);
  } catch (error) {
    console.error("Welcome email handler failed.", error instanceof Error ? error.message : "Unknown error");
    return respond(500, { ok: false, code: "unexpected_error", message: "The welcome email could not be processed right now." }, origin);
  }
});
