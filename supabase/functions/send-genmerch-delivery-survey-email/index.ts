import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { renderGenmerchEmail } from "./_shared/genmerch-email-template.ts";

const ALLOWED_ORIGINS=new Set(["https://jelsonroqueza.github.io","https://shopgenmerch.com","https://www.shopgenmerch.com"]);
function corsHeaders(origin:string|null){return {"Access-Control-Allow-Origin":origin&&ALLOWED_ORIGINS.has(origin)?origin:"https://shopgenmerch.com","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};}
function respond(status:number,body:Record<string,unknown>,origin:string|null){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
function esc(value:unknown):string{return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]??c));}
function money(value:unknown):string{return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",maximumFractionDigits:2}).format(Number(value)||0);}
function dateText(value:unknown):string{const d=new Date(String(value??""));return Number.isNaN(d.getTime())?"Not available":new Intl.DateTimeFormat("en-PH",{dateStyle:"medium",timeZone:"Asia/Manila"}).format(d);}
function normalizePhone(value:unknown):string{let digits=String(value??"").replace(/\D/g,"");if(digits.startsWith("63"))digits="0"+digits.slice(2);return digits;}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin");
 if(origin&&!ALLOWED_ORIGINS.has(origin))return new Response("Forbidden origin",{status:403});
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders(origin)});
 const reply=(status:number,body:Record<string,unknown>)=>respond(status,body,origin);
 if(req.method!=="POST")return reply(405,{ok:false,message:"Use POST to request the delivery survey email."});
 const url=Deno.env.get("SUPABASE_URL")||"",secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",resend=Deno.env.get("RESEND_API_KEY")||"",from=Deno.env.get("GENMERCH_EMAIL_FROM")||"";
 if(!url||!secret)return reply(503,{ok:false,message:"Survey email service is not configured."});
 let body:Record<string,unknown>;
 try{body=await req.json();}catch{return reply(400,{ok:false,message:"Invalid JSON."});}
 const token=(req.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1]||"";
 let userId="",isAdmin=false;
 if(token){
  const publicKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
  if(!publicKey)return reply(503,{ok:false,message:"Customer authentication key unavailable."});
  const userClient=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:"Bearer "+token}}});
  const {data:user,error:userError}=await userClient.auth.getUser(token);
  if(userError||!user.user)return reply(401,{ok:false,message:"Session invalid. Sign in again."});
  userId=user.user.id;
  const {data:allowed,error:adminError}=await userClient.rpc("is_genmerch_admin");
  isAdmin=!adminError&&allowed===true;
 }
 const orderId=String(body.order_id||"").trim();
 const orderNumber=String(body.order_number||"").trim();
 const phone=String(body.customer_phone||"").trim();
 const validId=/^[0-9a-f-]{36}$/i.test(orderId);
 if(orderId&&!validId)return reply(400,{ok:false,message:"Invalid order ID."});
 if(!userId&&(!orderNumber||!phone))return reply(401,{ok:false,message:"Sign in or provide the guest order number and checkout mobile number."});
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  let query=db.from("orders").select("id,order_number,user_id,customer_name,customer_email,receipt_email,customer_phone,status,payment_status,payment_method,total_amount,updated_at");
  query=validId?query.eq("id",orderId):query.eq("order_number",orderNumber);
  const {data:order,error:orderError}=await query.maybeSingle();
  if(orderError||!order)return reply(404,{ok:false,message:"Order not found. Check the order details and try again."});
  if(userId){
   if(!isAdmin&&String(order.user_id||"")!==userId)return reply(403,{ok:false,message:"You cannot request an email for another customer's order."});
  }else{
   if(order.user_id||normalizePhone(order.customer_phone)!==normalizePhone(phone))return reply(403,{ok:false,message:"The guest order number and checkout mobile number did not match."});
  }
  const currentStatus=String(order.status||"").toLowerCase(),paymentStatus=String(order.payment_status||"").toLowerCase();
  if(currentStatus!=="delivered"||paymentStatus!=="paid"){
   return reply(200,{ok:true,eligible:false,message:"The survey email is sent only after delivery is confirmed and payment is marked paid."});
  }
  const recipient=String(order.receipt_email||order.customer_email||"").trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recipient)||recipient.length>254)return reply(409,{ok:false,message:"No valid customer email on this order."});
  if(!resend||!from)return reply(503,{ok:false,message:"The order is delivered and paid, but email provider settings are missing."});
  const {data:items,error:itemError}=await db.from("order_items").select("product_name,sku,size_label,color_label,quantity,line_total,unit_price").eq("order_id",order.id).order("created_at");
  if(itemError)return reply(500,{ok:false,message:"Could not prepare the delivery survey email."});
  const {data:reservation,error:reserveError}=await db.rpc("reserve_genmerch_order_event_email",{p_order_id:order.id,p_email_type:"delivery_survey"});
  if(reserveError)return reply(409,{ok:false,message:reserveError.message||"Could not reserve the survey email."});
  const claim=Array.isArray(reservation)?reservation[0]:reservation;
  if(claim?.already_sent)return reply(200,{ok:true,eligible:true,already_sent:true,recipient_email:claim.recipient_email||recipient});
  if(claim?.already_sending)return reply(202,{ok:false,eligible:true,already_sending:true,recipient_email:claim.recipient_email||recipient});
  const itemRows=(items||[]).map((item:Record<string,unknown>)=>'<tr><td style="padding:10px;border-bottom:1px solid #e7eaee;font-size:12px;color:#202328"><strong>'+esc(item.product_name||item.sku||"GENMERCH item")+'</strong><div style="margin-top:4px;color:#78818a;font-size:11px">Qty '+esc(item.quantity)+' · '+esc([item.size_label?String(item.size_label):"",item.color_label?String(item.color_label):""].filter(Boolean).join(" · "))+'</div></td><td align="right" style="padding:10px;border-bottom:1px solid #e7eaee;white-space:nowrap;font-size:12px;font-weight:700">'+esc(money(item.line_total??Number(item.unit_price)*Number(item.quantity)))+'</td></tr>').join("");
  const details='<h2 style="margin:22px 0 10px;color:#202328;font-size:16px">Your Completed Order</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7eaee;border-radius:9px;border-collapse:separate;border-spacing:0;overflow:hidden"><tr><td style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#68717c;font-size:12px">Order number</td><td align="right" style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#202328;font-size:12px;font-weight:800">'+esc(order.order_number)+'</td></tr><tr><td style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#68717c;font-size:12px">Delivered on</td><td align="right" style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#202328;font-size:12px;font-weight:700">'+esc(dateText(order.updated_at))+'</td></tr><tr><td style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#68717c;font-size:12px">Payment status</td><td align="right" style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#08784c;font-size:12px;font-weight:800">Paid</td></tr><tr><td style="padding:13px;border-top:1px solid #d9dee4;color:#202328;font-size:13px;font-weight:900">Order total</td><td align="right" style="padding:13px;border-top:1px solid #d9dee4;color:#d10c22;font-size:14px;font-weight:900">'+esc(money(order.total_amount))+'</td></tr></table><h2 style="margin:22px 0 10px;color:#202328;font-size:16px">Items You Purchased</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7eaee;border-radius:9px;border-collapse:separate;border-spacing:0;overflow:hidden"><tr><th align="left" style="padding:10px;background:#f4f6f8;color:#626b75;font-size:10px">ITEM</th><th align="right" style="padding:10px;background:#f4f6f8;color:#626b75;font-size:10px">AMOUNT</th></tr>'+itemRows+'</table>';
  const html=renderGenmerchEmail({preheader:"Your GENMERCH order is delivered and paid. We'd love your feedback.",headline:"How Was Your Experience?",icon:"★",tone:"success",greeting:"Hi "+String(order.customer_name||"GENMERCH customer")+",",intro:"Your order has been delivered successfully and payment is confirmed. Thank you for shopping with GENMERCH — we would love to hear how your experience went.",bodyHtml:details,actionLabel:"Share Your Feedback",actionUrl:"https://shopgenmerch.com/",actionNote:"Sign in and open My Orders to review eligible items from this purchase.",noticeTitle:"Your Feedback Matters",notice:"Your feedback helps GENMERCH improve our products, delivery experience, and customer service. Sharing a review is optional and will not affect your account or future orders.",noticeTone:"info",footerNote:"This survey invitation was sent to "+recipient+" for delivered and paid order "+String(order.order_number||"")+"."});
  const textBody=["GENMERCH — QUALITY MERCH FOR EVERY FAN","","HOW WAS YOUR EXPERIENCE?","","Hi "+String(order.customer_name||"GENMERCH customer")+",","Your order has been delivered successfully and payment is confirmed. Thank you for shopping with GENMERCH — we would love to hear how your experience went.","","Order number: "+String(order.order_number||""),"Delivered on: "+dateText(order.updated_at),"Payment status: Paid","Order total: "+money(order.total_amount),"","Share your feedback: https://shopgenmerch.com/","Sign in and open My Orders to review eligible items from this purchase.","","Your feedback is optional and helps GENMERCH improve our products, delivery experience, and customer service.","","GENMERCH Customer Support"].join("\n");
  let response:Response,payload:Record<string,unknown>={};
  try{
   response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+resend,"Content-Type":"application/json"},body:JSON.stringify({from,to:[recipient],subject:"How was your GENMERCH order? | "+String(order.order_number||""),html,text:textBody})});
   try{payload=await response.json();}catch{}
  }catch(error){
   await db.rpc("finish_genmerch_order_event_email",{p_order_id:order.id,p_email_type:"delivery_survey",p_status:"failed",p_provider_message_id:null,p_error:error instanceof Error?error.message:"Email transport failed"});
   return reply(502,{ok:false,message:"The order is delivered and paid, but the survey email could not be sent."});
  }
  if(!response.ok){
   const errorText=String(payload.message||payload.name||("Resend returned HTTP "+response.status));
   await db.rpc("finish_genmerch_order_event_email",{p_order_id:order.id,p_email_type:"delivery_survey",p_status:"failed",p_provider_message_id:null,p_error:errorText});
   return reply(502,{ok:false,message:"The email provider rejected the survey email."});
  }
  const {error:finishError}=await db.rpc("finish_genmerch_order_event_email",{p_order_id:order.id,p_email_type:"delivery_survey",p_status:"sent",p_provider_message_id:String(payload.id||""),p_error:null});
  if(finishError)console.error("Survey email accepted but notification state could not be finalized.");
  return reply(200,{ok:true,eligible:true,recipient_email:recipient,message_id:payload.id||"",delivery_status:finishError?"accepted_by_resend":"sent"});
 }catch(error){
  console.error("Delivery survey email handler failed.",error instanceof Error?error.message:"Unknown error");
  return reply(500,{ok:false,message:"The survey email could not be processed."});
 }
});
