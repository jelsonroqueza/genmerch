import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ALLOWED_ORIGIN = "https://jelsonroqueza.github.io";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" } });
}
function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}
function money(value: unknown): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(Number(value) || 0);
}
function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}
function dateText(value: unknown): string {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(date);
}
function addressText(order: Record<string, unknown>): string {
  return [order.shipping_street_address, order.shipping_barangay, order.shipping_city_municipality, order.shipping_province, order.shipping_postal_code]
    .filter((part) => String(part ?? "").trim()).map((part) => String(part)).join(", ");
}
function buildShipmentHtml(order: Record<string, unknown>, shipment: Record<string, unknown>, items: Array<Record<string, unknown>>, recipient: string): string {
  const itemRows = items.map((item) => {
    const option = [item.size_label ? "Size: " + String(item.size_label) : "", item.color_label ? "Color: " + String(item.color_label) : ""].filter(Boolean).join(" · ");
    return '<tr><td style="padding:10px;border-bottom:1px solid #f0e2dc;font-size:13px;color:#3c3430"><strong>' + escapeHtml(item.product_name || "GENMERCH item") + '</strong>' +
      (item.sku ? '<div style="margin-top:4px;color:#81766f;font-size:11px">SKU: ' + escapeHtml(item.sku) + '</div>' : "") +
      (option ? '<div style="margin-top:4px;color:#81766f;font-size:11px">' + escapeHtml(option) + '</div>' : "") +
      '<div style="margin-top:4px;color:#81766f;font-size:11px">Qty: ' + escapeHtml(item.quantity) + '</div></td>' +
      '<td style="padding:10px;border-bottom:1px solid #f0e2dc;text-align:right;white-space:nowrap;font-size:12px;font-weight:700">' + escapeHtml(money(item.line_total)) + '</td></tr>';
  }).join("");
  const paymentStatus = String(order.payment_status ?? "pending").toLowerCase();
  const paymentLine = paymentStatus === "paid" ? "Payment status: Paid." :
    "Payment status: " + escapeHtml(paymentStatus.replace(/_/g, " ")) + ". This shipping email is not a payment receipt.";
  const deliveryAddress = addressText(order);
  const trackingUrl = String(shipment.tracking_url ?? "").trim();
  const referenceLine = trackingUrl && /^https?:\/\//i.test(trackingUrl)
    ? '<a href="' + escapeHtml(trackingUrl) + '" style="color:#f32b16;font-weight:800;text-decoration:none">' + escapeHtml(shipment.tracking_number) + '</a>'
    : escapeHtml(shipment.tracking_number);
  return '<!doctype html><html><body style="margin:0;padding:0;background:#f5f2f0;font-family:Arial,Helvetica,sans-serif;color:#282321">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f2f0;padding:24px 10px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #ecdcd4;border-radius:14px;overflow:hidden">' +
    '<tr><td style="background:#f52d16;padding:22px 24px;color:#fff"><div style="font-size:21px;font-weight:900;letter-spacing:.1px">GENMERCH - Suot Apparel</div><div style="font-size:12px;margin-top:5px;opacity:.95">Your everyday style. Your order reference.</div></td></tr>' +
    '<tr><td style="padding:24px"><h1 style="margin:0 0 10px;font-size:21px;color:#29221f">Your order is on its way!</h1>' +
    '<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#665b55">Hi ' + escapeHtml(order.customer_name) + ', your GENMERCH order has been marked as shipped. Keep this email and your delivery reference for tracking or when contacting the seller.</p>' +
    '<div style="padding:16px;border:1px solid #ffc1b5;border-radius:10px;background:#fff8f5"><div style="font-size:10px;font-weight:800;color:#86746c;text-transform:uppercase;letter-spacing:.7px">Order number</div>' +
    '<div style="margin-top:6px;font-size:21px;font-weight:900;color:#f32b16;overflow-wrap:anywhere">' + escapeHtml(order.order_number) + '</div>' +
    '<div style="margin-top:8px;font-size:11px;color:#887870">Shipped: ' + escapeHtml(dateText(shipment.shipped_at || shipment.updated_at)) + ' (Philippine time)</div></div>' +
    '<h2 style="margin:22px 0 10px;font-size:15px">Shipping details</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dce9f6;border-radius:10px;background:#f7fbff">' +
    '<tr><td style="padding:12px 14px;font-size:12px;color:#627488;border-bottom:1px solid #e1eaf4">Courier / delivery service</td><td style="padding:12px 14px;font-size:13px;font-weight:800;text-align:right;border-bottom:1px solid #e1eaf4">' + escapeHtml(shipment.courier_name) + '</td></tr>' +
    '<tr><td style="padding:12px 14px;font-size:12px;color:#627488;border-bottom:1px solid #e1eaf4">Delivery Reference #</td><td style="padding:12px 14px;font-size:13px;font-weight:900;text-align:right;overflow-wrap:anywhere;border-bottom:1px solid #e1eaf4">' + referenceLine + '</td></tr>' +
    '<tr><td style="padding:12px 14px;font-size:12px;color:#627488">Shipment status</td><td style="padding:12px 14px;font-size:13px;font-weight:900;color:#0b6941;text-align:right">In Transit</td></tr></table>' +
    '<h2 style="margin:22px 0 10px;font-size:15px">Order details</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #ecdcd4;border-radius:9px;overflow:hidden">' +
    '<tr style="background:#fff6f1"><th align="left" style="padding:10px;font-size:10px;color:#806b60;text-transform:uppercase">Item</th><th align="right" style="padding:10px;font-size:10px;color:#806b60;text-transform:uppercase">Amount</th></tr>' + itemRows + '</table>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px"><tr><td style="padding:6px 0;font-size:12px;color:#736660">Items subtotal</td><td align="right" style="padding:6px 0;font-size:12px;font-weight:700">' + escapeHtml(money(order.subtotal)) + '</td></tr>' +
    '<tr><td style="padding:6px 0;font-size:12px;color:#736660">Delivery fee</td><td align="right" style="padding:6px 0;font-size:12px;font-weight:700">' + escapeHtml(money(order.shipping_fee)) + '</td></tr>' +
    '<tr><td style="padding:11px 0;border-top:1px solid #ecdcd4;font-size:15px;font-weight:900">Total order amount</td><td align="right" style="padding:11px 0;border-top:1px solid #ecdcd4;color:#f32b16;font-size:16px;font-weight:900">' + escapeHtml(money(order.total_amount)) + '</td></tr></table>' +
    '<h2 style="margin:22px 0 10px;font-size:15px">Delivery information</h2><div style="padding:13px;border:1px solid #e9dfda;border-radius:9px;background:#fcfbfa;font-size:12px;line-height:1.8;color:#665b55">' +
    '<div><strong>Recipient:</strong> ' + escapeHtml(order.customer_name) + '</div><div><strong>Mobile:</strong> ' + escapeHtml(order.customer_phone) + '</div><div><strong>Address:</strong> ' + escapeHtml(deliveryAddress) + '</div>' +
    (order.shipping_landmark ? '<div><strong>Landmark:</strong> ' + escapeHtml(order.shipping_landmark) + '</div>' : "") +
    (order.delivery_instructions ? '<div><strong>Delivery instructions:</strong> ' + escapeHtml(order.delivery_instructions) + '</div>' : "") + '</div>' +
    '<div style="margin-top:16px;padding:13px;border:1px solid #f2d39d;border-radius:9px;background:#fff9ec;color:#785500;font-size:12px;line-height:1.7"><strong>Payment information</strong><div style="margin-top:5px">Payment method: ' + escapeHtml(order.payment_method || "Not specified") + '</div><div>' + paymentLine + '</div></div>' +
    '<p style="margin:20px 0 0;font-size:12px;line-height:1.7;color:#6e625c">Please keep your order number and courier reference. Order status will continue to update in GENMERCH My Orders. If the reference does not work on the courier tracking page immediately, try again later or contact the seller.</p></td></tr>' +
    '<tr><td style="padding:16px 24px;background:#faf7f5;border-top:1px solid #eee1da;color:#8c7d75;font-size:10px;line-height:1.6">This order update was sent to ' + escapeHtml(recipient) + ' by GENMERCH - Suot Apparel.</td></tr>' +
    '</table></td></tr></table></body></html>';
}
function buildShipmentText(order: Record<string, unknown>, shipment: Record<string, unknown>, items: Array<Record<string, unknown>>, recipient: string): string {
  const itemLines = items.map((item) => {
    const options = [item.size_label ? "Size: " + String(item.size_label) : "", item.color_label ? "Color: " + String(item.color_label) : ""].filter(Boolean).join(" / ");
    return "- " + String(item.product_name || "GENMERCH item") + (options ? " (" + options + ")" : "") + " | Qty: " + String(item.quantity) + " | " + money(item.line_total);
  }).join("\n");
  return [
    "GENMERCH - Suot Apparel", "Your order is on its way!", "",
    "Order number: " + String(order.order_number),
    "Shipped: " + dateText(shipment.shipped_at || shipment.updated_at) + " (Philippine time)", "",
    "SHIPPING DETAILS", "Courier: " + String(shipment.courier_name),
    "Delivery Reference #: " + String(shipment.tracking_number), "Shipment status: In Transit", "",
    "ORDER DETAILS", itemLines, "",
    "Items subtotal: " + money(order.subtotal), "Delivery fee: " + money(order.shipping_fee),
    "Total order amount: " + money(order.total_amount), "",
    "DELIVERY INFORMATION", "Recipient: " + String(order.customer_name || ""),
    "Mobile: " + String(order.customer_phone || ""), "Address: " + addressText(order), "",
    "PAYMENT INFORMATION", "Payment method: " + String(order.payment_method || "Not specified"),
    "Payment status: " + String(order.payment_status || "pending"), "This shipping email is not a payment receipt.", "",
    "Please keep your order number and courier reference. The order status will continue to update in GENMERCH My Orders.",
    "", "Sent to " + recipient + " by GENMERCH - Suot Apparel.",
  ].join("\n");
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (origin && origin !== ALLOWED_ORIGIN) return new Response("Forbidden origin", { status: 403 });
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return jsonResponse(405, { ok: false, code: "method_not_allowed", message: "Use POST to send a shipment update." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const fromAddress = Deno.env.get("GENMERCH_EMAIL_FROM") || "";
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || "";

  if (!supabaseUrl || !serviceRoleKey) return jsonResponse(503, { ok: false, code: "supabase_not_configured", message: "The shipment email service is not configured." });
  if (!token) return jsonResponse(401, { ok: false, code: "authentication_required", message: "Sign in as a GENMERCH administrator to send a shipment email." });

  let publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!publishableKey) {
    try {
      const keyMap = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
      const envName = String(keyMap.default || "");
      if (envName) publishableKey = Deno.env.get(envName) || "";
    } catch { publishableKey = ""; }
  }
  if (!publishableKey) return jsonResponse(503, { ok: false, code: "auth_key_unavailable", message: "The administrator verification key is missing from Supabase environment settings." });

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) return jsonResponse(401, { ok: false, code: "invalid_session", message: "Your administrator session is no longer valid. Sign in again and retry." });
  if (userData.user.app_metadata?.role !== "admin") return jsonResponse(403, { ok: false, code: "admin_required", message: "Only a GENMERCH administrator can send shipment notifications." });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonResponse(400, { ok: false, code: "invalid_json", message: "Request body must be valid JSON." }); }
  const orderId = String(body.order_id ?? "").trim();
  const orderNumber = String(body.order_number ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId) ||
      !/^GM-[0-9]{8}-[A-F0-9]{8}$/i.test(orderNumber)) {
    return jsonResponse(400, { ok: false, code: "invalid_order_details", message: "The order reference is invalid." });
  }
  if (!resendApiKey || !fromAddress) return jsonResponse(503, { ok: false, code: "email_provider_not_configured", message: "The order was shipped, but email sending is not configured. The shipping details remain saved." });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: order, error: orderError } = await admin.from("orders")
      .select("id,order_number,customer_name,customer_phone,customer_email,receipt_email,status,payment_method,payment_status,subtotal,shipping_fee,total_amount,shipping_street_address,shipping_barangay,shipping_city_municipality,shipping_province,shipping_postal_code,shipping_landmark,delivery_instructions,created_at")
      .eq("id", orderId).eq("order_number", orderNumber).maybeSingle();
    if (orderError || !order) return jsonResponse(404, { ok: false, code: "order_not_found", message: "The order could not be found for this shipping update." });
    if (!["shipped", "out_for_delivery", "delivered"].includes(String(order.status).toLowerCase())) {
      return jsonResponse(409, { ok: false, code: "order_not_shipped", message: "The order is not marked as shipped yet." });
    }
    const recipient = String(order.receipt_email || order.customer_email || "").trim().toLowerCase();
    if (!validEmail(recipient)) return jsonResponse(409, { ok: false, code: "no_recipient_email", message: "No valid customer receipt email is saved on this order." });

    const { data: shipment, error: shipmentError } = await admin.from("shipments")
      .select("order_id,courier_name,tracking_number,tracking_url,status,shipped_at,updated_at")
      .eq("order_id", orderId).maybeSingle();
    if (shipmentError || !shipment || !shipment.courier_name || !shipment.tracking_number) {
      return jsonResponse(409, { ok: false, code: "shipment_details_missing", message: "Courier and delivery reference details must be saved before sending this email." });
    }
    const { data: items, error: itemsError } = await admin.from("order_items")
      .select("product_name,sku,size_label,color_label,quantity,unit_price,line_total")
      .eq("order_id", orderId).order("created_at", { ascending: true });
    if (itemsError || !Array.isArray(items) || items.length === 0) return jsonResponse(500, { ok: false, code: "items_unavailable", message: "The shipping details were saved, but the order email could not be prepared." });

    const { data: reservationData, error: reservationError } = await admin.rpc("reserve_genmerch_shipment_email", { p_order_id: orderId });
    if (reservationError) {
      console.error("Could not reserve shipment notification.", reservationError.message);
      return jsonResponse(409, { ok: false, code: "shipment_email_guard", message: reservationError.message || "The shipment email could not be queued." });
    }
    const reservation = Array.isArray(reservationData) ? reservationData[0] : reservationData;
    if (reservation?.status === "sent" && reservation?.already_sent) return jsonResponse(200, { ok: true, already_sent: true, recipient_email: reservation.recipient_email });
    if (reservation?.already_sending) return jsonResponse(409, { ok: false, code: "shipment_email_in_progress", message: "A shipment notification for this order is already being processed. Check the customer inbox before retrying." });

    let providerResponse: Response;
    let providerPayload: Record<string, unknown> = {};
    try {
      providerResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": "Bearer " + resendApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromAddress,
          to: [reservation?.recipient_email || recipient],
          subject: "Your GENMERCH order has shipped | " + String(order.order_number),
          html: buildShipmentHtml(order, shipment, items, reservation?.recipient_email || recipient),
          text: buildShipmentText(order, shipment, items, reservation?.recipient_email || recipient),
        }),
      });
      try { providerPayload = await providerResponse.json(); } catch { providerPayload = {}; }
    } catch (error) {
      await admin.rpc("finish_genmerch_shipment_email", { p_order_id: orderId, p_status: "failed", p_provider_message_id: null, p_error: String(error) });
      console.error("Resend transport failed for shipment notification.");
      return jsonResponse(502, { ok: false, code: "email_provider_unreachable", message: "The order is shipped, but the customer email could not be sent. The shipping information remains saved." });
    }
    if (!providerResponse.ok) {
      const providerError = String(providerPayload.message || providerPayload.name || ("Resend returned HTTP " + providerResponse.status));
      await admin.rpc("finish_genmerch_shipment_email", { p_order_id: orderId, p_status: "failed", p_provider_message_id: null, p_error: providerError });
      console.error("Resend rejected a GENMERCH shipment notification.", { status: providerResponse.status, error: providerError });
      return jsonResponse(502, { ok: false, code: "email_provider_rejected", message: "The order is shipped, but Resend could not accept the notification email. The shipping information remains saved." });
    }

    const messageId = String(providerPayload.id || "");
    const { error: finishError } = await admin.rpc("finish_genmerch_shipment_email", { p_order_id: orderId, p_status: "sent", p_provider_message_id: messageId, p_error: null });
    if (finishError) console.error("Shipment email accepted by provider but notification state could not be updated.", finishError.message);
    return jsonResponse(200, { ok: true, recipient_email: reservation?.recipient_email || recipient, message_id: messageId });
  } catch (error) {
    console.error("Shipment notification handler failed.", error instanceof Error ? error.message : "unknown error");
    return jsonResponse(500, { ok: false, code: "unexpected_error", message: "The order was marked shipped, but the shipment email could not be sent. The shipping details remain saved." });
  }
});
