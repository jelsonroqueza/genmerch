import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { renderGenmerchEmail } from "./_shared/genmerch-email-template.ts";
const ORIGINS=new Set(["https://jelsonroqueza.github.io","https://shopgenmerch.com","https://www.shopgenmerch.com"]);
const h=(o:string|null)=>({"Access-Control-Allow-Origin":o&&ORIGINS.has(o)?o:"https://shopgenmerch.com","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const out=(s:number,b:Record<string,unknown>,o:string|null)=>new Response(JSON.stringify(b),{status:s,headers:{...h(o),"Content-Type":"application/json; charset=utf-8"}});
const esc=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]??c));
const money=(v:unknown)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(v)||0);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin");if(origin&&!ORIGINS.has(origin))return new Response("Forbidden origin",{status:403});
 if(req.method==="OPTIONS")return new Response("ok",{headers:h(origin)});
 const reply=(s:number,b:Record<string,unknown>)=>out(s,b,origin);
 if(req.method!=="POST")return reply(405,{ok:false,message:"POST required."});
 const url=Deno.env.get("SUPABASE_URL")||"",secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",resend=Deno.env.get("RESEND_API_KEY")||"",from=Deno.env.get("GENMERCH_EMAIL_FROM")||"";
 const token=(req.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1]||"";
 if(!url||!secret)return reply(503,{ok:false,message:"Email service is not configured."});
 if(!token)return reply(401,{ok:false,message:"Administrator sign-in required."});
 let pub=Deno.env.get("SUPABASE_ANON_KEY")||"";if(!pub){try{const m=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");pub=Deno.env.get(String(m.default||""))||"";}catch{}}
 if(!pub)return reply(503,{ok:false,message:"Admin verification key unavailable."});
 const userClient=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:"Bearer "+token}}});
 const {data:user,error:ue}=await userClient.auth.getUser(token);if(ue||!user.user)return reply(401,{ok:false,message:"Session invalid. Sign in again."});
 const {data:allowed,error:ae}=await userClient.rpc("is_genmerch_admin");if(ae||allowed!==true)return reply(403,{ok:false,message:"Authorized GENMERCH admin only."});
 let body:Record<string,unknown>;try{body=await req.json();}catch{return reply(400,{ok:false,message:"Invalid JSON."});}
 const id=String(body.order_id||"");if(!/^[0-9a-f-]{36}$/i.test(id))return reply(400,{ok:false,message:"Invalid order ID."});
 if(!resend||!from)return reply(503,{ok:false,message:"The order was cancelled, but email provider settings are missing."});
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:o,error:oe}=await db.from("orders").select("id,order_number,customer_name,receipt_email,customer_email,status,subtotal,shipping_fee,total_amount,created_at,cancellation_reason").eq("id",id).maybeSingle();
  if(oe||!o)return reply(404,{ok:false,message:"Order not found."});if(String(o.status).toLowerCase()!=="cancelled")return reply(409,{ok:false,message:"Order is not cancelled."});
  const recipient=String(o.receipt_email||o.customer_email||"").trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recipient))return reply(409,{ok:false,message:"No valid customer email on order."});
  const {data:items,error:ie}=await db.from("order_items").select("product_name,sku,size_label,color_label,quantity,unit_price,line_total").eq("order_id",id).order("created_at");
  if(ie||!items?.length)return reply(500,{ok:false,message:"Could not prepare order summary."});
  const {data:r,error:re}=await db.rpc("reserve_genmerch_cancellation_email",{p_order_id:id});if(re)return reply(409,{ok:false,message:re.message});
  const reserve=Array.isArray(r)?r[0]:r;if(reserve?.already_sent)return reply(200,{ok:true,already_sent:true});if(reserve?.already_sending)return reply(409,{ok:false,message:"Email already processing."});
  const reason=String(reserve?.cancellation_reason||o.cancellation_reason||"No additional reason was provided.");
  const itemLines=items.map((i:Record<string,unknown>)=>"- "+String(i.product_name||i.sku||"GENMERCH item")+" | "+[i.size_label?"Size: "+i.size_label:"",i.color_label?"Color: "+i.color_label:"","Qty: "+i.quantity].filter(Boolean).join(", ")+" | "+money(i.line_total??Number(i.unit_price)*Number(i.quantity)));
  const textBody=["GENMERCH - Suot Apparel","ORDER CANCELLATION CONFIRMATION","","Hello "+String(o.customer_name||"GENMERCH customer")+",","This confirms that your order has been cancelled.","Order number: "+o.order_number,"Order placed: "+o.created_at,"Cancellation details: "+reason,"","Cancelled order summary:",...itemLines,"","Subtotal: "+money(o.subtotal),"Shipping: "+money(o.shipping_fee),"Order total: "+money(o.total_amount),"","If you already paid, this email does not itself confirm a refund. Any applicable refund will be handled according to the payment method and GENMERCH support process.","If you did not expect this cancellation, contact GENMERCH support and include your order number.","","GENMERCH Customer Support"].join("\n");
  const html=renderGenmerchEmail({
    preheader:"Your GENMERCH order "+String(o.order_number||"")+" has been cancelled.",
    headline:"Order Cancelled",icon:"×",tone:"danger",
    greeting:"Hello "+String(o.customer_name||"GENMERCH customer")+",",
    intro:"This email confirms that your GENMERCH order has been cancelled.",
    bodyHtml:'<h2 style="margin:22px 0 10px;color:#202328;font-size:16px">Order Details</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7eaee;border-radius:9px;border-collapse:separate;border-spacing:0;overflow:hidden">'+
      '<tr><td style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#68717c;font-size:12px">Order number</td><td align="right" style="padding:11px 13px;border-bottom:1px solid #e7eaee;font-size:12px;font-weight:800;color:#202328">'+esc(o.order_number)+'</td></tr>'+
      '<tr><td style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#68717c;font-size:12px">Order placed</td><td align="right" style="padding:11px 13px;border-bottom:1px solid #e7eaee;font-size:12px;font-weight:700;color:#202328">'+esc(o.created_at)+'</td></tr>'+
      '<tr><td style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#68717c;font-size:12px">Subtotal</td><td align="right" style="padding:11px 13px;border-bottom:1px solid #e7eaee;font-size:12px;font-weight:700;color:#202328">'+esc(money(o.subtotal))+'</td></tr>'+
      '<tr><td style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#68717c;font-size:12px">Shipping</td><td align="right" style="padding:11px 13px;border-bottom:1px solid #e7eaee;font-size:12px;font-weight:700;color:#202328">'+esc(money(o.shipping_fee))+'</td></tr>'+
      '<tr><td style="padding:13px;border-top:1px solid #d9dee4;color:#202328;font-size:14px;font-weight:900">Order total</td><td align="right" style="padding:13px;border-top:1px solid #d9dee4;color:#d10c22;font-size:15px;font-weight:900">'+esc(money(o.total_amount))+'</td></tr></table>'+
      '<h2 style="margin:22px 0 10px;color:#202328;font-size:16px">Cancelled Items</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7eaee;border-radius:9px;border-collapse:separate;border-spacing:0;overflow:hidden"><tr><th align="left" style="padding:10px;background:#f4f6f8;color:#626b75;font-size:10px">ITEM</th><th align="right" style="padding:10px;background:#f4f6f8;color:#626b75;font-size:10px">AMOUNT</th></tr>'+
      items.map((i:Record<string,unknown>)=>'<tr><td style="padding:11px;border-bottom:1px solid #e7eaee;font-size:12px;color:#202328"><strong>'+esc(i.product_name||i.sku||"GENMERCH item")+'</strong><div style="margin-top:4px;color:#78818a;font-size:11px">Qty '+esc(i.quantity)+' · '+esc([i.size_label?String(i.size_label):"",i.color_label?String(i.color_label):""].filter(Boolean).join(" · "))+'</div></td><td align="right" style="padding:11px;border-bottom:1px solid #e7eaee;font-size:12px;font-weight:700">'+esc(money(i.line_total??Number(i.unit_price)*Number(i.quantity)))+'</td></tr>').join("")+'</table>',
    actionLabel:"View Order Details",actionUrl:"https://shopgenmerch.com/",
    actionNote:"Sign in to GENMERCH and open My Orders if you need to review the cancelled order.",
    noticeTitle:"Refund Information",notice:"Cancellation does not itself confirm a refund. If payment was already made, any applicable refund will follow the payment method and confirmed refund status.",noticeTone:"warning",
    footerNote:"This automated cancellation notification was sent to "+String(recipient||"")+" for order "+String(o.order_number||"")+"."
  });
  let resp:Response,payload:Record<string,unknown>={};try{resp=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+resend,"Content-Type":"application/json"},body:JSON.stringify({from,to:[recipient],subject:"GENMERCH order cancellation confirmation | "+o.order_number,html,text:textBody})});try{payload=await resp.json();}catch{}}catch(e){await db.rpc("finish_genmerch_cancellation_email",{p_order_id:id,p_status:"failed",p_provider_message_id:null,p_error:String(e)});return reply(502,{ok:false,message:"Order remains cancelled; email send failed."});}
  if(!resp.ok){const err=String(payload.message||payload.name||("Resend HTTP "+resp.status));await db.rpc("finish_genmerch_cancellation_email",{p_order_id:id,p_status:"failed",p_provider_message_id:null,p_error:err});return reply(502,{ok:false,message:"Order remains cancelled; email provider rejected the message."});}
  const {error:fe}=await db.rpc("finish_genmerch_cancellation_email",{p_order_id:id,p_status:"sent",p_provider_message_id:String(payload.id||""),p_error:null});if(fe)console.error("Email accepted but status update failed",fe.message);
  return reply(200,{ok:true,recipient_email:recipient,message_id:payload.id||""});
 }catch(e){console.error("Cancellation email handler error",e instanceof Error?e.message:"unknown");return reply(500,{ok:false,message:"Order remains cancelled; email could not be sent."});}
});