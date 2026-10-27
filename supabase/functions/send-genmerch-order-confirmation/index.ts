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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
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
 const safeName=escapeHtml(order.customer_name||"GENMERCH customer"),safeNumber=escapeHtml(order.order_number),address=escapeHtml(buildAddress(order));
 const row=(label:string,value:string)=>'<tr><td style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#68717c;font-size:13px">'+escapeHtml(label)+'</td><td align="right" style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#202328;font-size:13px;font-weight:700;overflow-wrap:anywhere">'+value+'</td></tr>';
 const itemRows=items.map((item)=>'<tr><td style="padding:12px 10px;border-bottom:1px solid #e7eaee;vertical-align:top"><div style="font-size:13px;color:#202328;font-weight:700">'+escapeHtml(item.product_name||item.sku||"GENMERCH item")+'</div><div style="margin-top:4px;font-size:11px;color:#78818a">'+[item.size_label?"Size: "+escapeHtml(item.size_label):"",item.color_label?"Color: "+escapeHtml(item.color_label):"","Qty: "+escapeHtml(item.quantity)].filter(Boolean).join(" · ")+'</div></td><td align="right" style="padding:12px 10px;border-bottom:1px solid #e7eaee;white-space:nowrap;font-size:12px;font-weight:800">'+escapeHtml(money(item.line_total??Number(item.unit_price)*Number(item.quantity)))+'</td></tr>').join("");
 const method=String(order.payment_method||"Not specified"),paymentStatus=String(order.payment_status||"pending").toLowerCase();
 const paymentCopy=paymentStatus==="paid"?"Payment status is confirmed as PAID. Keep this email as your order reference.":(method.toUpperCase()==="COD"?"Payment is pending. Cash on Delivery is settled only when payment is received and confirmed.":"Payment is pending. "+method+" is your selected method; no payment was charged automatically. Follow the instructions agreed with the seller.");
 const body='<h2 style="margin:22px 0 10px;color:#202328;font-size:16px">Order Details</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7eaee;border-radius:9px;border-collapse:separate;border-spacing:0;overflow:hidden">'+row("Order number",safeNumber)+row("Order date",escapeHtml(dateText(order.created_at)))+row("Payment method",escapeHtml(method))+row("Items subtotal",escapeHtml(money(order.subtotal)))+row("Delivery fee",escapeHtml(money(order.shipping_fee)))+'<tr><td style="padding:13px;border-top:1px solid #d9dee4;font-size:14px;font-weight:900">Total Amount</td><td align="right" style="padding:13px;border-top:1px solid #d9dee4;color:#d10c22;font-size:17px;font-weight:900">'+escapeHtml(money(order.total_amount))+'</td></tr></table>'+
 '<h2 style="margin:22px 0 10px;color:#202328;font-size:16px">Items in Your Order</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7eaee;border-radius:9px;border-collapse:separate;border-spacing:0;overflow:hidden"><tr><th align="left" style="padding:10px;background:#f4f6f8;color:#626b75;font-size:10px">ITEM</th><th align="right" style="padding:10px;background:#f4f6f8;color:#626b75;font-size:10px">AMOUNT</th></tr>'+itemRows+'</table>'+
 '<h2 style="margin:22px 0 10px;color:#202328;font-size:16px">Delivery Information</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:12px 14px;background:#f8f9fa;border:1px solid #e7eaee;border-radius:9px;border-collapse:separate;border-spacing:0;font-size:12px;line-height:1.6">'+row("Recipient",safeName)+row("Mobile",escapeHtml(order.customer_phone))+row("Address",address)+(String(order.shipping_landmark||"").trim()?row("Landmark",escapeHtml(order.shipping_landmark)):"")+(String(order.delivery_instructions||"").trim()?row("Delivery instructions",escapeHtml(order.delivery_instructions)):"")+'</table>';
 const progress='<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;border-collapse:collapse"><tr><td align="center" style="width:25%;padding:8px 2px;color:#c80d21;font-size:11px;line-height:1.5;font-weight:800">●<br>Order Placed</td><td align="center" style="width:25%;padding:8px 2px;color:#9299a2;font-size:11px;line-height:1.5">○<br>Preparing</td><td align="center" style="width:25%;padding:8px 2px;color:#9299a2;font-size:11px;line-height:1.5">○<br>In Transit</td><td align="center" style="width:25%;padding:8px 2px;color:#9299a2;font-size:11px;line-height:1.5">○<br>Delivered</td></tr></table>';
 return renderGenmerchEmail({preheader:"We received order "+String(order.order_number||"")+" and are preparing the next steps.",headline:"Order Placed Successfully!",icon:"✓",tone:"success",greeting:"Hi "+String(order.customer_name||"GENMERCH customer")+",",intro:"Thank you for your order! We've received your order details and your purchase is now being prepared.",bodyHtml:body,progressHtml:progress,noticeTitle:"Payment Information",notice:paymentCopy,noticeTone:paymentStatus==="paid"?"success":"warning",actionLabel:"View My Order",actionUrl:"https://shopgenmerch.com/",actionNote:"Sign in to GENMERCH and open My Orders to track your order status.",footerNote:"This message was sent to "+String(recipient||"")+" for order notifications. If you did not place this order, contact support."});
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
    "Open https://shopgenmerch.com/, sign in, and select Orders to track your order.",
    "", "This email confirms that the order was saved. It does not confirm that payment has been received.",
    "Sent to: " + recipient,
  ].filter(Boolean).join("\n");
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const respond = (status: number, payload: Record<string, unknown>) => jsonResponse(status, payload, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response("Forbidden origin", { status: 403 });
  }
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return respond(405, { ok: false, code: "method_not_allowed", message: "Use POST for order confirmation." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return respond(500, { ok: false, code: "backend_not_configured", message: "Order email service backend is not configured." });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return respond(400, { ok: false, code: "invalid_json", message: "Request body must be valid JSON." });
  }
  const orderId = String(body.order_id ?? "").trim();
  const orderNumber = String(body.order_number ?? "").trim();
  const phone = String(body.customer_phone ?? "").trim();
  const recipient = String(body.recipient_email ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId) ||
      !/^GM-[0-9]{8}-[A-F0-9]{8}$/i.test(orderNumber) ||
      !/^09[0-9]{9}$/.test(phone) ||
      !validEmail(recipient)) {
    return respond(400, { ok: false, code: "invalid_order_details", message: "Check the order number, checkout mobile number, and recipient email." });
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
      .eq("receipt_email", recipient)
      .maybeSingle();

    if (orderError || !order) {
      return respond(404, { ok: false, code: "order_not_found", message: "Order details could not be verified. Keep your order number and contact the seller if needed." });
    }
    const createdAt = new Date(String(order.created_at)).getTime();
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > 48 * 60 * 60 * 1000 || createdAt > Date.now() + 5 * 60 * 1000) {
      return respond(403, { ok: false, code: "confirmation_window_expired", message: "The automatic email confirmation window has expired." });
    }

    // receipt_email is saved atomically during order creation and cannot be changed through this public endpoint.
    if (String(order.receipt_email || "").trim().toLowerCase() !== recipient) {
      return respond(409, {
        ok: false,
        code: "receipt_email_mismatch",
        message: "This email does not match the receipt address selected during checkout. Contact the seller if you need help.",
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromAddress = Deno.env.get("GENMERCH_EMAIL_FROM");
    if (!resendApiKey || !fromAddress) {
      return respond(503, {
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
      return respond(409, { ok: false, code: "email_send_guard", message: reservationError.message || "The confirmation email could not be queued." });
    }
    const reservation = Array.isArray(reservationData) ? reservationData[0] : reservationData;
    if (reservation?.status === "sent") {
      return respond(200, { ok: true, already_sent: true, recipient_email: reservation.recipient_email || recipient });
    }
    if (reservation?.already_sending) {
      return respond(202, { ok: false, sending: true, recipient_email: reservation.recipient_email || recipient, message: "Your order email is already being processed." });
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
      return respond(500, { ok: false, code: "items_unavailable", message: "Order saved, but its email details could not be prepared." });
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
      return respond(502, { ok: false, code: "email_provider_unreachable", message: "The order was saved, but the confirmation email could not be sent right now. Please screenshot the order confirmation." });
    }

    if (!providerResponse.ok) {
      const providerError = String(providerPayload.message || providerPayload.name || `Resend returned HTTP ${providerResponse.status}`);
      await admin.rpc("finish_genmerch_order_confirmation_email", {
        p_order_id: orderId, p_status: "failed", p_provider_message_id: null, p_error: providerError,
      });
      console.error("Resend rejected a GENMERCH order confirmation.", { status: providerResponse.status, error: providerError });
      return respond(502, { ok: false, code: "email_provider_rejected", message: "Your order was saved, but the confirmation email could not be sent. Please screenshot the order confirmation and keep your order number." });
    }

    const messageId = String(providerPayload.id || "");
    const { error: finishError } = await admin.rpc("finish_genmerch_order_confirmation_email", {
      p_order_id: orderId, p_status: "sent", p_provider_message_id: messageId, p_error: null,
    });
    if (finishError) console.error("Email was accepted by provider but notification state could not be updated.", finishError.message);
    return respond(200, { ok: true, recipient_email: recipient, message_id: messageId });
  } catch (error) {
    console.error("Order email confirmation handler failed.", error instanceof Error ? error.message : "unknown error");
    return respond(500, { ok: false, code: "unexpected_error", message: "Your order was saved, but the confirmation email could not be sent right now. Please screenshot your order confirmation." });
  }
});
