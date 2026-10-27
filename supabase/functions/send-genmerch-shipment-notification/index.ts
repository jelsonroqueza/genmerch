import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { renderGenmerchEmail } from "./_shared/genmerch-email-template.ts";

const ALLOWED_ORIGINS = new Set([
  "https://jelsonroqueza.github.io",
  "https://shopgenmerch.com",
  "https://www.shopgenmerch.com",
]);
function corsHeaders(origin: string | null = null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://shopgenmerch.com",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(status: number, body: Record<string, unknown>, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" } });
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
 const trackingUrl=String(shipment.tracking_url??"").trim(),validTrackingUrl=/^https?:\/\/[^\s"'<>]+$/i.test(trackingUrl),paymentStatus=String(order.payment_status??"pending").toLowerCase();
 const row=(label:string,value:string)=>'<tr><td style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#68717c;font-size:12px">'+escapeHtml(label)+'</td><td align="right" style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#202328;font-size:12px;font-weight:800;overflow-wrap:anywhere">'+value+'</td></tr>';
 const itemsHtml=items.map(item=>'<tr><td style="padding:10px;border-bottom:1px solid #e7eaee;font-size:13px;color:#202328"><strong>'+escapeHtml(item.product_name||"GENMERCH item")+'</strong><div style="margin-top:4px;color:#78818a;font-size:11px">'+[item.size_label?"Size: "+escapeHtml(item.size_label):"",item.color_label?"Color: "+escapeHtml(item.color_label):""].filter(Boolean).join(" · ")+'</div><div style="margin-top:4px;color:#78818a;font-size:11px">Qty: '+escapeHtml(item.quantity)+'</div></td><td align="right" style="padding:10px;border-bottom:1px solid #e7eaee;white-space:nowrap;font-size:12px;font-weight:700">'+escapeHtml(money(item.line_total))+'</td></tr>').join("");
 const details='<h2 style="margin:22px 0 10px;color:#202328;font-size:16px">Shipping Details</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7eaee;border-radius:9px;border-collapse:separate;border-spacing:0;overflow:hidden">'+row("Order number",escapeHtml(order.order_number))+row("Courier",escapeHtml(shipment.courier_name||"Your selected courier"))+row("Tracking number",escapeHtml(shipment.tracking_number||"Not provided"))+row("Shipment status","In Transit")+row("Shipped on",escapeHtml(dateText(shipment.shipped_at||shipment.updated_at)))+row("Order total",escapeHtml(money(order.total_amount)))+'</table><h2 style="margin:22px 0 10px;color:#202328;font-size:16px">Items in Your Order</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7eaee;border-radius:9px;border-collapse:separate;border-spacing:0;overflow:hidden"><tr><th align="left" style="padding:10px;background:#f4f6f8;color:#626b75;font-size:10px">ITEM</th><th align="right" style="padding:10px;background:#f4f6f8;color:#626b75;font-size:10px">AMOUNT</th></tr>'+itemsHtml+'</table>';
 return renderGenmerchEmail({preheader:"Your GENMERCH order "+String(order.order_number||"")+" is on its way.",headline:"Your Order Is on the Way!",icon:"➜",tone:"info",greeting:"Good news, "+String(order.customer_name||"GENMERCH customer")+"!",intro:"Your order has been handed to the courier and is now in transit to your delivery address.",bodyHtml:details,noticeTitle:"Payment Information",notice:paymentStatus==="paid"?"Payment status: Paid. This email is a shipping update, not a separate payment receipt.":"Payment status: "+paymentStatus.replace(/_/g," ")+". This shipping email is not a payment receipt.",noticeTone:paymentStatus==="paid"?"success":"warning",actionLabel:"Track My Order",actionUrl:validTrackingUrl?trackingUrl:"https://shopgenmerch.com/",actionNote:validTrackingUrl?"Use your tracking reference if the courier page asks for it.":"Sign in to GENMERCH and open My Orders for the latest status.",footerNote:"This order update was sent to "+String(recipient||"")+". Keep your order number and courier reference for support."});
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
  const respond = (status: number, payload: Record<string, unknown>) => jsonResponse(status, payload, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response("Forbidden origin", { status: 403 });
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return respond(405, { ok: false, code: "method_not_allowed", message: "Use POST to send a shipment update." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const fromAddress = Deno.env.get("GENMERCH_EMAIL_FROM") || "";
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || "";

  if (!supabaseUrl || !serviceRoleKey) return respond(503, { ok: false, code: "supabase_not_configured", message: "The shipment email service is not configured." });
  if (!token) return respond(401, { ok: false, code: "authentication_required", message: "Sign in as a GENMERCH administrator to send a shipment email." });

  let publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!publishableKey) {
    try {
      const keyMap = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
      const envName = String(keyMap.default || "");
      if (envName) publishableKey = Deno.env.get(envName) || "";
    } catch { publishableKey = ""; }
  }
  if (!publishableKey) return respond(503, { ok: false, code: "auth_key_unavailable", message: "The administrator verification key is missing from Supabase environment settings." });

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) return respond(401, { ok: false, code: "invalid_session", message: "Your administrator session is no longer valid. Sign in again and retry." });
  const { data: allowedAdmin, error: adminGuardError } = await userClient.rpc("is_genmerch_admin");
  if (adminGuardError || allowedAdmin !== true) {
    return respond(403, { ok: false, code: "admin_required", message: "Only one of the two authorized GENMERCH admin accounts can send shipment notifications." });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return respond(400, { ok: false, code: "invalid_json", message: "Request body must be valid JSON." }); }
  const orderId = String(body.order_id ?? "").trim();
  const orderNumber = String(body.order_number ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId) ||
      !/^GM-[0-9]{8}-[A-F0-9]{8}$/i.test(orderNumber)) {
    return respond(400, { ok: false, code: "invalid_order_details", message: "The order reference is invalid." });
  }
  if (!resendApiKey || !fromAddress) return respond(503, { ok: false, code: "email_provider_not_configured", message: "The order was shipped, but email sending is not configured. The shipping details remain saved." });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: order, error: orderError } = await admin.from("orders")
      .select("id,order_number,customer_name,customer_phone,customer_email,receipt_email,status,payment_method,payment_status,subtotal,shipping_fee,total_amount,shipping_street_address,shipping_barangay,shipping_city_municipality,shipping_province,shipping_postal_code,shipping_landmark,delivery_instructions,created_at")
      .eq("id", orderId).eq("order_number", orderNumber).maybeSingle();
    if (orderError || !order) return respond(404, { ok: false, code: "order_not_found", message: "The order could not be found for this shipping update." });
    if (!["shipped", "out_for_delivery", "delivered"].includes(String(order.status).toLowerCase())) {
      return respond(409, { ok: false, code: "order_not_shipped", message: "The order is not marked as shipped yet." });
    }
    const recipient = String(order.receipt_email || order.customer_email || "").trim().toLowerCase();
    if (!validEmail(recipient)) return respond(409, { ok: false, code: "no_recipient_email", message: "No valid customer receipt email is saved on this order." });

    const { data: shipment, error: shipmentError } = await admin.from("shipments")
      .select("order_id,courier_name,tracking_number,tracking_url,status,shipped_at,updated_at")
      .eq("order_id", orderId).maybeSingle();
    if (shipmentError || !shipment || !shipment.courier_name || !shipment.tracking_number) {
      return respond(409, { ok: false, code: "shipment_details_missing", message: "Courier and delivery reference details must be saved before sending this email." });
    }
    const { data: items, error: itemsError } = await admin.from("order_items")
      .select("product_name,sku,size_label,color_label,quantity,unit_price,line_total")
      .eq("order_id", orderId).order("created_at", { ascending: true });
    if (itemsError || !Array.isArray(items) || items.length === 0) return respond(500, { ok: false, code: "items_unavailable", message: "The shipping details were saved, but the order email could not be prepared." });

    const { data: reservationData, error: reservationError } = await admin.rpc("reserve_genmerch_shipment_email", { p_order_id: orderId });
    if (reservationError) {
      console.error("Could not reserve shipment notification.", reservationError.message);
      return respond(409, { ok: false, code: "shipment_email_guard", message: reservationError.message || "The shipment email could not be queued." });
    }
    const reservation = Array.isArray(reservationData) ? reservationData[0] : reservationData;
    if (reservation?.status === "sent" && reservation?.already_sent) return respond(200, { ok: true, already_sent: true, recipient_email: reservation.recipient_email });
    if (reservation?.already_sending) return respond(409, { ok: false, code: "shipment_email_in_progress", message: "A shipment notification for this order is already being processed. Check the customer inbox before retrying." });

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
      return respond(502, { ok: false, code: "email_provider_unreachable", message: "The order is shipped, but the customer email could not be sent. The shipping information remains saved." });
    }
    if (!providerResponse.ok) {
      const providerError = String(providerPayload.message || providerPayload.name || ("Resend returned HTTP " + providerResponse.status));
      await admin.rpc("finish_genmerch_shipment_email", { p_order_id: orderId, p_status: "failed", p_provider_message_id: null, p_error: providerError });
      console.error("Resend rejected a GENMERCH shipment notification.", { status: providerResponse.status, error: providerError });
      return respond(502, { ok: false, code: "email_provider_rejected", message: "The order is shipped, but Resend could not accept the notification email. The shipping information remains saved." });
    }

    const messageId = String(providerPayload.id || "");
    const { error: finishError } = await admin.rpc("finish_genmerch_shipment_email", { p_order_id: orderId, p_status: "sent", p_provider_message_id: messageId, p_error: null });
    if (finishError) console.error("Shipment email accepted by provider but notification state could not be updated.", finishError.message);
    return respond(200, { ok: true, recipient_email: reservation?.recipient_email || recipient, message_id: messageId });
  } catch (error) {
    console.error("Shipment notification handler failed.", error instanceof Error ? error.message : "unknown error");
    return respond(500, { ok: false, code: "unexpected_error", message: "The order was marked shipped, but the shipment email could not be sent. The shipping details remain saved." });
  }
});
