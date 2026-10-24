import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ALLOWED_ORIGIN = "https://jelsonroqueza.github.io";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}
function money(value: unknown): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP", maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}
function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}
function dateText(value: unknown): string {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
  }).format(date) + " (Philippine time)";
}
function buildAddress(order: Record<string, unknown>): string {
  return [
    order.shipping_street_address, order.shipping_barangay,
    order.shipping_city_municipality, order.shipping_province, order.shipping_postal_code,
  ].filter((part) => String(part ?? "").trim()).map((part) => String(part).trim()).join(", ");
}
function buildEmailHtml(order: Record<string, unknown>, items: Record<string, unknown>[], recipient: string): string {
  const orderNumber = escapeHtml(order.order_number);
  const customerName = escapeHtml(order.customer_name);
  const address = escapeHtml(buildAddress(order));
  const lines = items.map((item) => {
    const title = escapeHtml(item.product_name || item.sku || "GENMERCH item");
    const options = [
      item.size_label ? "Size: " + escapeHtml(item.size_label) : "",
      item.color_label ? "Color: " + escapeHtml(item.color_label) : "",
      "Qty: " + escapeHtml(item.quantity),
    ].filter(Boolean).join(" · ");
    return `<tr>
      <td style="padding:14px 10px;border-bottom:1px solid #f0e5df;vertical-align:top">
        <div style="font-weight:700;color:#2c201b">${title}</div>
        <div style="margin-top:5px;color:#786c65;font-size:13px">${options}</div>
      </td>
      <td style="padding:14px 10px;border-bottom:1px solid #f0e5df;text-align:right;white-space:nowrap;font-weight:700;color:#2c201b">${money(item.line_total ?? (Number(item.unit_price) * Number(item.quantity)))}</td>
    </tr>`;
  }).join("");
  const paymentMethod = escapeHtml(order.payment_method || "Not specified");
  const paymentStatus = String(order.payment_status || "pending").toLowerCase();
  const paymentCopy = paymentStatus === "paid"
    ? "Payment status: Paid. Keep this email as your order and payment reference."
    : (String(order.payment_method || "").toUpperCase() === "COD"
      ? "Payment status: Pending. Cash on Delivery is settled when payment is actually received and confirmed."
      : `Payment status: Pending. ${paymentMethod} is your preferred payment method; no payment was charged automatically. The seller will coordinate the payment instructions with you.`);
  const landmark = String(order.shipping_landmark || "").trim()
    ? `<p style="margin:8px 0;color:#5e5049"><strong>Landmark:</strong> ${escapeHtml(order.shipping_landmark)}</p>`
    : "";
  const instructions = String(order.delivery_instructions || "").trim()
    ? `<p style="margin:8px 0;color:#5e5049"><strong>Delivery instructions:</strong> ${escapeHtml(order.delivery_instructions)}</p>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f3f1;font-family:Arial,Helvetica,sans-serif;color:#29211d">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Your GENMERCH order details and order number ${orderNumber}.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f3f1;padding:28px 10px">
    <tr><td align="center">
      <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #eee1da">
        <tr><td style="padding:26px 28px;background:#f32c16;color:#fff">
          <div style="font-size:24px;line-height:1.2;font-weight:900;letter-spacing:-.4px">GENMERCH - Suot Apparel</div>
          <div style="margin-top:7px;font-size:13px;line-height:1.5;opacity:.94">Your everyday style. Your order reference.</div>
        </td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 10px;color:#29211d;font-size:23px">Thank you for your order, ${customerName}!</h1>
          <p style="margin:0 0 20px;color:#6f625b;font-size:15px;line-height:1.65">We've saved your order in GENMERCH. Please keep this email for reference and use your order number whenever you contact the seller.</p>
          <div style="padding:17px 18px;border:1px solid #ffb8a8;border-radius:10px;background:#fff7f3">
            <div style="color:#80665a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Order number</div>
            <div style="margin-top:6px;color:#f12e17;font-size:25px;line-height:1.3;font-weight:900;overflow-wrap:anywhere">${orderNumber}</div>
            <div style="margin-top:8px;color:#80665a;font-size:12px">Placed: ${escapeHtml(dateText(order.created_at))}</div>
          </div>
          <h2 style="margin:26px 0 10px;font-size:17px;color:#29211d">Order details</h2>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #f0e5df;border-radius:8px">
            <tr><th align="left" style="padding:11px 10px;background:#fff6f1;font-size:12px;color:#6d5044">ITEM</th><th align="right" style="padding:11px 10px;background:#fff6f1;font-size:12px;color:#6d5044">AMOUNT</th></tr>
            ${lines}
          </table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-collapse:collapse">
            <tr><td style="padding:7px 0;color:#6f625b">Items subtotal</td><td align="right" style="padding:7px 0;font-weight:700">${money(order.subtotal)}</td></tr>
            <tr><td style="padding:7px 0;color:#6f625b">Delivery fee ${order.delivery_zone ? "(" + escapeHtml(order.delivery_zone) + ")" : ""}</td><td align="right" style="padding:7px 0;font-weight:700">${money(order.shipping_fee)}</td></tr>
            <tr><td style="padding:13px 0;border-top:1px solid #e9ddd6;font-weight:900;font-size:17px">Total order amount</td><td align="right" style="padding:13px 0;border-top:1px solid #e9ddd6;color:#f12e17;font-weight:900;font-size:19px">${money(order.total_amount)}</td></tr>
          </table>
          <h2 style="margin:24px 0 9px;font-size:17px;color:#29211d">Delivery information</h2>
          <div style="padding:14px 15px;border:1px solid #ece4de;border-radius:8px;background:#fcfbfa">
            <p style="margin:0 0 8px;color:#5e5049"><strong>Recipient:</strong> ${customerName}</p>
            <p style="margin:8px 0;color:#5e5049"><strong>Mobile:</strong> ${escapeHtml(order.customer_phone)}</p>
            <p style="margin:8px 0;color:#5e5049"><strong>Address:</strong> ${address}</p>
            ${landmark}${instructions}
          </div>
          <h2 style="margin:24px 0 9px;font-size:17px;color:#29211d">Payment instructions</h2>
          <div style="padding:14px 15px;border-radius:8px;background:#fff8e8;border:1px solid #f1dca4;color:#6f5110;font-size:14px;line-height:1.65">
            <p style="margin:0 0 6px"><strong>Preferred payment method:</strong> ${paymentMethod}</p>
            <p style="margin:0">${escapeHtml(paymentCopy)}</p>
          </div>
          <div style="margin-top:23px;padding:15px;border-radius:9px;background:#fff4ef;border:1px solid #ffd2c4">
            <div style="font-size:15px;font-weight:900;color:#aa2a16">Important: Save your order reference</div>
            <p style="margin:7px 0 0;font-size:14px;line-height:1.65;color:#67483e">Please take a screenshot of the order confirmation screen and check this email for your reference. Keep your order number safe. You can open GENMERCH, sign in to your account, and select <strong>Orders</strong> to track progress.</p>
          </div>
          <p style="margin:22px 0 0;color:#6f625b;font-size:13px;line-height:1.6">This confirmation is not proof that payment has been received. Your payment and delivery statuses will update separately as the seller processes the order.</p>
        </td></tr>
        <tr><td style="padding:17px 28px;background:#fffaf7;border-top:1px solid #f0e5df;color:#8b7a70;font-size:12px;line-height:1.6">
          <strong style="color:#58453b">GENMERCH - Suot Apparel</strong><br>
          This message was sent to ${escapeHtml(recipient)} because this address was selected for order notifications. If you did not place this order, contact the store and do not make a payment.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function buildEmailText(order: Record<string, unknown>, items: Record<string, unknown>[], recipient: string): string {
  const lines = items.map((item) => `- ${String(item.product_name || item.sku || "GENMERCH item")} | Size: ${String(item.size_label || "N/A")} | Color: ${String(item.color_label || "N/A")} | Qty: ${String(item.quantity)} | ${money(item.line_total ?? (Number(item.unit_price) * Number(item.quantity)))}`).join("\n");
  const address = buildAddress(order);
  const payment = String(order.payment_method || "Not specified").toUpperCase() === "COD"
    ? "COD payment remains pending until received and confirmed."
    : `${String(order.payment_method || "Selected method")} is your preference only. Payment remains pending; no payment was charged automatically. The seller will coordinate instructions.`;
  return [
    "GENMERCH - Suot Apparel", "Thank you for your order, " + String(order.customer_name || "Customer") + "!",
    "", "Order number: " + String(order.order_number), "Placed: " + dateText(order.created_at), "",
    "ORDER DETAILS", lines, "", "Items subtotal: " + money(order.subtotal),
    "Delivery fee: " + money(order.shipping_fee), "Total order amount: " + money(order.total_amount),
    "", "DELIVERY INFORMATION", "Recipient: " + String(order.customer_name || ""),
    "Mobile: " + String(order.customer_phone || ""), "Address: " + address,
    order.shipping_landmark ? "Landmark: " + String(order.shipping_landmark) : "",
    order.delivery_instructions ? "Delivery instructions: " + String(order.delivery_instructions) : "",
    "", "PAYMENT", "Preferred payment method: " + String(order.payment_method || "Not specified"),
    "Payment status: " + String(order.payment_status || "pending"), payment, "",
    "IMPORTANT: Please take a screenshot of the order confirmation screen and check this email for your reference. Keep your order number safe.",
    "Open https://jelsonroqueza.github.io/genmerch/, sign in, and select Orders to track your order.",
    "", "This email confirms that the order was saved. It does not confirm that payment has been received.",
    "Sent to: " + recipient,
  ].filter(Boolean).join("\n");
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { ok: false, code: "method_not_allowed", message: "Use POST for order confirmation." });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== ALLOWED_ORIGIN) {
    return jsonResponse(403, { ok: false, code: "origin_not_allowed", message: "This storefront is not allowed to call the email endpoint." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { ok: false, code: "backend_not_configured", message: "Order email service backend is not configured." });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { ok: false, code: "invalid_json", message: "Request body must be valid JSON." });
  }
  const orderId = String(body.order_id ?? "").trim();
  const orderNumber = String(body.order_number ?? "").trim();
  const phone = String(body.customer_phone ?? "").trim();
  const recipient = String(body.recipient_email ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId) ||
      !/^GM-[0-9]{8}-[A-F0-9]{8}$/i.test(orderNumber) ||
      !/^09[0-9]{9}$/.test(phone) ||
      !validEmail(recipient)) {
    return jsonResponse(400, { ok: false, code: "invalid_order_details", message: "Check the order number, checkout mobile number, and recipient email." });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,order_number,customer_name,customer_phone,customer_email,receipt_email,payment_method,payment_status,status,subtotal,shipping_fee,total_amount,delivery_zone,shipping_street_address,shipping_barangay,shipping_city_municipality,shipping_province,shipping_postal_code,shipping_landmark,delivery_instructions,created_at")
      .eq("id", orderId)
      .eq("order_number", orderNumber)
      .eq("customer_phone", phone)
      .maybeSingle();

    if (orderError || !order) {
      return jsonResponse(404, { ok: false, code: "order_not_found", message: "Order details could not be verified. Keep your order number and contact the seller if needed." });
    }
    const createdAt = new Date(String(order.created_at)).getTime();
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > 48 * 60 * 60 * 1000 || createdAt > Date.now() + 5 * 60 * 1000) {
      return jsonResponse(403, { ok: false, code: "confirmation_window_expired", message: "The automatic email confirmation window has expired." });
    }

    // Store the customer's selected receipt destination even if the email provider still needs setup.
    const { error: recipientSaveError } = await admin
      .from("orders")
      .update({ receipt_email: recipient })
      .eq("id", orderId);
    if (recipientSaveError) {
      console.error("Could not save order receipt recipient.", recipientSaveError.message);
      return jsonResponse(500, { ok: false, code: "recipient_save_failed", message: "Order saved, but the receipt email address could not be saved." });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromAddress = Deno.env.get("GENMERCH_EMAIL_FROM");
    if (!resendApiKey || !fromAddress) {
      return jsonResponse(503, {
        ok: false,
        code: "email_provider_not_configured",
        message: "The order is saved, but automatic email delivery is not configured yet. Please screenshot the order confirmation and keep your order number.",
        recipient_email: recipient,
      });
    }

    const { data: reservationData, error: reservationError } = await admin.rpc("reserve_genmerch_order_confirmation_email", {
      p_order_id: orderId,
      p_order_number: orderNumber,
      p_customer_phone: phone,
      p_recipient_email: recipient,
    });
    if (reservationError) {
      console.error("Could not reserve the order confirmation email.", reservationError.message);
      return jsonResponse(409, { ok: false, code: "email_send_guard", message: reservationError.message || "The confirmation email could not be queued." });
    }
    const reservation = Array.isArray(reservationData) ? reservationData[0] : reservationData;
    if (reservation?.status === "sent") {
      return jsonResponse(200, { ok: true, already_sent: true, recipient_email: reservation.recipient_email || recipient });
    }
    if (reservation?.already_sending) {
      return jsonResponse(202, { ok: false, sending: true, recipient_email: reservation.recipient_email || recipient, message: "Your order email is already being processed." });
    }

    const { data: items, error: itemsError } = await admin
      .from("order_items")
      .select("product_name,sku,size_label,color_label,quantity,unit_price,line_total")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    if (itemsError || !Array.isArray(items) || items.length === 0) {
      await admin.rpc("finish_genmerch_order_confirmation_email", {
        p_order_id: orderId, p_status: "failed", p_provider_message_id: null, p_error: "Order items could not be loaded.",
      });
      return jsonResponse(500, { ok: false, code: "items_unavailable", message: "Order saved, but its email details could not be prepared." });
    }

    let providerResponse: Response;
    let providerPayload: Record<string, unknown> = {};
    try {
      providerResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [recipient],
          subject: `Thank you for your order ${orderNumber} | GENMERCH - Suot Apparel`,
          html: buildEmailHtml(order, items, recipient),
          text: buildEmailText(order, items, recipient),
        }),
      });
      try { providerPayload = await providerResponse.json(); } catch { providerPayload = {}; }
    } catch (error) {
      await admin.rpc("finish_genmerch_order_confirmation_email", {
        p_order_id: orderId, p_status: "failed", p_provider_message_id: null, p_error: String(error),
      });
      return jsonResponse(502, { ok: false, code: "email_provider_unreachable", message: "The order was saved, but the confirmation email could not be sent right now. Please screenshot the order confirmation." });
    }

    if (!providerResponse.ok) {
      const providerError = String(providerPayload.message || providerPayload.name || `Resend returned HTTP ${providerResponse.status}`);
      await admin.rpc("finish_genmerch_order_confirmation_email", {
        p_order_id: orderId, p_status: "failed", p_provider_message_id: null, p_error: providerError,
      });
      console.error("Resend rejected a GENMERCH order confirmation.", { status: providerResponse.status, error: providerError });
      return jsonResponse(502, { ok: false, code: "email_provider_rejected", message: "Your order was saved, but the confirmation email could not be sent. Please screenshot the order confirmation and keep your order number." });
    }

    const messageId = String(providerPayload.id || "");
    const { error: finishError } = await admin.rpc("finish_genmerch_order_confirmation_email", {
      p_order_id: orderId, p_status: "sent", p_provider_message_id: messageId, p_error: null,
    });
    if (finishError) console.error("Email was accepted by provider but notification state could not be updated.", finishError.message);
    return jsonResponse(200, { ok: true, recipient_email: recipient, message_id: messageId });
  } catch (error) {
    console.error("Order email confirmation handler failed.", error instanceof Error ? error.message : "unknown error");
    return jsonResponse(500, { ok: false, code: "unexpected_error", message: "Your order was saved, but the confirmation email could not be sent right now. Please screenshot your order confirmation." });
  }
});
