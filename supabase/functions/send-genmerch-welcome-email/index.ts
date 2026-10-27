import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { renderGenmerchEmail } from "./_shared/genmerch-email-template.ts";

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
 const tiles='<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;border-collapse:separate;border-spacing:7px"><tr><td width="50%" valign="top" style="padding:14px 10px;background:#f4f6f8;border:1px solid #e7eaee;border-radius:9px;text-align:center"><div style="font-size:23px;color:#d10c22">▣</div><strong style="display:block;margin-top:6px;color:#202328;font-size:12px">Quality Merch</strong><div style="margin-top:4px;color:#626b75;font-size:11px;line-height:1.5">Explore styles you'll love.</div></td><td width="50%" valign="top" style="padding:14px 10px;background:#f4f6f8;border:1px solid #e7eaee;border-radius:9px;text-align:center"><div style="font-size:23px;color:#d10c22">✓</div><strong style="display:block;margin-top:6px;color:#202328;font-size:12px">Secure Checkout</strong><div style="margin-top:4px;color:#626b75;font-size:11px;line-height:1.5">Shop with confidence.</div></td></tr><tr><td width="50%" valign="top" style="padding:14px 10px;background:#f4f6f8;border:1px solid #e7eaee;border-radius:9px;text-align:center"><div style="font-size:23px;color:#d10c22">➜</div><strong style="display:block;margin-top:6px;color:#202328;font-size:12px">Order Updates</strong><div style="margin-top:4px;color:#626b75;font-size:11px;line-height:1.5">Follow order progress in My Orders.</div></td><td width="50%" valign="top" style="padding:14px 10px;background:#f4f6f8;border:1px solid #e7eaee;border-radius:9px;text-align:center"><div style="font-size:23px;color:#d10c22">♡</div><strong style="display:block;margin-top:6px;color:#202328;font-size:12px">Your Account</strong><div style="margin-top:4px;color:#626b75;font-size:11px;line-height:1.5">Keep your account details up to date.</div></td></tr></table>';
 return renderGenmerchEmail({preheader:"Welcome to GENMERCH. Your customer account is ready.",headline:"Welcome to GENMERCH!",icon:"♥",tone:"brand",greeting:"Hi "+String(name||"GENMERCH customer")+",",intro:"Thank you for creating an account with us. You're now part of our growing community of merch fans, and we're excited to have you here.",bodyHtml:tiles,actionLabel:"Start Shopping",actionUrl:"https://shopgenmerch.com/",actionNote:"Sign in any time to view your account, follow order updates, and manage your saved items.",noticeTitle:"Keep Your Account Secure",notice:"Never share your password or verification codes by email. GENMERCH will never ask you to send your password to customer support.",noticeTone:"info",footerNote:"This service email was sent to "+String(email||"")+" because a GENMERCH account was created using this address."});
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
