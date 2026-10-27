import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { renderGenmerchEmail } from "./_shared/genmerch-email-template.ts";

const ALLOWED_ORIGINS = new Set(["https://jelsonroqueza.github.io","https://shopgenmerch.com","https://www.shopgenmerch.com"]);
function corsHeaders(origin: string | null) {
  return {"Access-Control-Allow-Origin":origin&&ALLOWED_ORIGINS.has(origin)?origin:"https://shopgenmerch.com","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
}
function respond(status:number,body:Record<string,unknown>,origin:string|null){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
function esc(value:unknown):string{return String(value??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]??c));}
function money(value:unknown):string{return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",maximumFractionDigits:2}).format(Number(value)||0);}
function dateText(value:unknown):string{const d=new Date(String(value??""));return Number.isNaN(d.getTime())?"Not available":new Intl.DateTimeFormat("en-PH",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Manila"}).format(d)+" (Philippine time)";}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin");
 if(origin&&!ALLOWED_ORIGINS.has(origin))return new Response("Forbidden origin",{status:403});
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders(origin)});
 const reply=(status:number,body:Record<string,unknown>)=>respond(status,body,origin);
 if(req.method!=="POST")return reply(405,{ok:false,message:"Use POST to request a refund notification."});
 const url=Deno.env.get("SUPABASE_URL")||"",secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",resend=Deno.env.get("RESEND_API_KEY")||"",from=Deno.env.get("GENMERCH_EMAIL_FROM")||"";
 if(!url||!secret)return reply(503,{ok:false,message:"Refund email service is not configured."});
 const token=(req.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1]||"";
 if(!token)return reply(401,{ok:false,message:"Administrator sign-in required."});
 const publicKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
 if(!publicKey)return reply(503,{ok:false,message:"Admin verification key unavailable."});
 const userClient=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:"Bearer "+token}}});
 const {data:user,error:userError}=await userClient.auth.getUser(token);
 if(userError||!user.user)return reply(401,{ok:false,message:"Session invalid. Sign in again."});
 const {data:allowed,error:adminError}=await userClient.rpc("is_genmerch_admin");
 if(adminError||allowed!==true)return reply(403,{ok:false,message:"Authorized GENMERCH admin only."});
 let body:Record<string,unknown>;
 try{body=await req.json();}catch{return reply(400,{ok:false,message:"Invalid JSON."});}
 const orderId=String(body.order_id||"");
 if(!/^[0-9a-f-]{36}$/i.test(orderId))return reply(400,{ok:false,message:"Invalid order ID."});
 if(!resend||!from)return reply(503,{ok:false,message:"Refund status is saved, but email provider settings are missing."});
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:order,error:orderError}=await db.from("orders").select("id,order_number,customer_name,receipt_email,customer_email,status,payment_status,payment_method,total_amount,created_at").eq("id",orderId).maybeSingle();
  if(orderError||!order)return reply(404,{ok:false,message:"Order not found."});
  if(String(order.status||"").toLowerCase()!=="refunded"&&String(order.payment_status||"").toLowerCase()!=="refunded")return reply(409,{ok:false,message:"Refund email can only be sent after the order or payment is marked refunded."});
  const recipient=String(order.receipt_email||order.customer_email||"").trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recipient)||recipient.length>254)return reply(409,{ok:false,message:"No valid customer email on this order."});
  const {data:items,error:itemError}=await db.from("order_items").select("product_name,sku,size_label,color_label,quantity,unit_price,line_total").eq("order_id",orderId).order("created_at");
  if(itemError)return reply(500,{ok:false,message:"Could not prepare the order summary."});
  const {data:reservation,error:reserveError}=await db.rpc("reserve_genmerch_order_event_email",{p_order_id:orderId,p_email_type:"refund"});
  if(reserveError)return reply(409,{ok:false,message:reserveError.message||"Could not reserve the refund email."});
  const claim=Array.isArray(reservation)?reservation[0]:reservation;
  if(claim?.already_sent)return reply(200,{ok:true,already_sent:true,recipient_email:claim.recipient_email||recipient});
  if(claim?.already_sending)return reply(202,{ok:false,already_sending:true,recipient_email:claim.recipient_email||recipient});
  const itemRows=(items||[]).map((item:Record<string,unknown>)=>'<tr><td style="padding:10px;border-bottom:1px solid #e7eaee;font-size:12px;color:#202328"><strong>'+esc(item.product_name||item.sku||"GENMERCH item")+'</strong><div style="margin-top:4px;color:#78818a;font-size:11px">Qty '+esc(item.quantity)+' · '+esc([item.size_label?String(item.size_label):"",item.color_label?String(item.color_label):""].filter(Boolean).join(" · "))+'</div></td><td align="right" style="padding:10px;border-bottom:1px solid #e7eaee;white-space:nowrap;font-size:12px;font-weight:700">'+esc(money(item.line_total??Number(item.unit_price)*Number(item.quantity)))+'</td></tr>').join("");
  const details='<h2 style="margin:22px 0 10px;color:#202328;font-size:16px">Refund Reference</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7eaee;border-radius:9px;border-collapse:separate;border-spacing:0;overflow:hidden">'+
   '<tr><td style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#68717c;font-size:12px">Order number</td><td align="right" style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#202328;font-size:12px;font-weight:800">'+esc(order.order_number)+'</td></tr>'+
   '<tr><td style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#68717c;font-size:12px">Original order date</td><td align="right" style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#202328;font-size:12px;font-weight:700">'+esc(dateText(order.created_at))+'</td></tr>'+
   '<tr><td style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#68717c;font-size:12px">Payment method</td><td align="right" style="padding:11px 13px;border-bottom:1px solid #e7eaee;color:#202328;font-size:12px;font-weight:700">'+esc(order.payment_method||"Not specified")+'</td></tr>'+
   '<tr><td style="padding:13px;border-top:1px solid #d9dee4;color:#202328;font-size:13px;font-weight:900">Original order total (reference)</td><td align="right" style="padding:13px;border-top:1px solid #d9dee4;color:#d10c22;font-size:14px;font-weight:900">'+esc(money(order.total_amount))+'</td></tr></table>'+
   '<h2 style="margin:22px 0 10px;color:#202328;font-size:16px">Items in the Order</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7eaee;border-radius:9px;border-collapse:separate;border-spacing:0;overflow:hidden"><tr><th align="left" style="padding:10px;background:#f4f6f8;color:#626b75;font-size:10px">ITEM</th><th align="right" style="padding:10px;background:#f4f6f8;color:#626b75;font-size:10px">AMOUNT</th></tr>'+itemRows+'</table>';
  const html=renderGenmerchEmail({preheader:"A refund status update for your GENMERCH order "+String(order.order_number||""),headline:"Refund Processed",icon:"↻",tone:"info",greeting:"Hi "+String(order.customer_name||"GENMERCH customer")+",",intro:"GENMERCH has marked this order as refunded. Keep this email as your reference while you check the payment method used for your purchase.",bodyHtml:details,noticeTitle:"Refund Timing",notice:"This email confirms the refund status recorded by GENMERCH. The time it takes for any funds to appear depends on the payment provider and payment method. The original order total shown above is for reference, not a statement of the final refund amount.",noticeTone:"info",actionLabel:"View GENMERCH",actionUrl:"https://shopgenmerch.com/",actionNote:"For help, contact support and include your order number.",footerNote:"This refund notification was sent to "+recipient+"."});
  const textBody=["GENMERCH — SUOT APPAREL","REFUND PROCESSED","","Hi "+String(order.customer_name||"GENMERCH customer")+",","GENMERCH has marked this order as refunded.","Order number: "+String(order.order_number||""),"Original order date: "+dateText(order.created_at),"Payment method: "+String(order.payment_method||"Not specified"),"Original order total (reference): "+money(order.total_amount),"","This email confirms the refund status recorded by GENMERCH. The time it takes for any funds to appear depends on the payment provider and payment method. The original order total is not a statement of the final refund amount.","Visit GENMERCH: https://shopgenmerch.com/","Contact: negosyonipinoy@yahoo.com.ph"].join("\n");
  let response:Response,payload:Record<string,unknown>={};
  try{
   response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+resend,"Content-Type":"application/json"},body:JSON.stringify({from,to:[recipient],subject:"GENMERCH refund processed | "+String(order.order_number||""),html,text:textBody})});
   try{payload=await response.json();}catch{}
  }catch(error){
   await db.rpc("finish_genmerch_order_event_email",{p_order_id:orderId,p_email_type:"refund",p_status:"failed",p_provider_message_id:null,p_error:error instanceof Error?error.message:"Email transport failed"});
   return reply(502,{ok:false,message:"Refund status is saved, but the refund email could not be sent."});
  }
  if(!response.ok){
   const errorText=String(payload.message||payload.name||("Resend returned HTTP "+response.status));
   await db.rpc("finish_genmerch_order_event_email",{p_order_id:orderId,p_email_type:"refund",p_status:"failed",p_provider_message_id:null,p_error:errorText});
   return reply(502,{ok:false,message:"Refund status is saved, but the email provider rejected the message."});
  }
  const {error:finishError}=await db.rpc("finish_genmerch_order_event_email",{p_order_id:orderId,p_email_type:"refund",p_status:"sent",p_provider_message_id:String(payload.id||""),p_error:null});
  if(finishError)console.error("Refund email accepted but notification state could not be finalized.");
  return reply(200,{ok:true,recipient_email:recipient,message_id:payload.id||"",delivery_status:finishError?"accepted_by_resend":"sent"});
 }catch(error){
  console.error("Refund email handler failed.",error instanceof Error?error.message:"Unknown error");
  return reply(500,{ok:false,message:"The refund email could not be processed."});
 }
});
