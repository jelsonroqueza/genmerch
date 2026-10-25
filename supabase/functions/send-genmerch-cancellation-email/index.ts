import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
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
  const html='<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#29211d;border:1px solid #eee1da;border-radius:12px;overflow:hidden"><header style="background:#f32c16;color:white;padding:24px;font-size:22px;font-weight:bold">GENMERCH - Suot Apparel</header><main style="padding:24px"><p style="color:#a32929;font-weight:bold">ORDER CANCELLED</p><h2>Hello '+esc(o.customer_name||"GENMERCH customer")+',</h2><p>This email confirms that your GENMERCH order has been cancelled.</p><div style="padding:16px;background:#fff7f6;border:1px solid #f0d3d0"><b>Order number: '+esc(o.order_number)+'</b><p>Order placed: '+esc(o.created_at)+'</p></div><h3>Cancellation details</h3><p>'+esc(reason)+'</p><h3>Cancelled order summary</h3><ul>'+items.map((i:Record<string,unknown>)=>'<li>'+esc(i.product_name||i.sku||"GENMERCH item")+' — Qty '+esc(i.quantity)+' — '+esc(money(i.line_total??Number(i.unit_price)*Number(i.quantity)))+'</li>').join("")+'</ul><p>Subtotal: '+esc(money(o.subtotal))+'<br>Shipping: '+esc(money(o.shipping_fee))+'<br><b>Order total: '+esc(money(o.total_amount))+'</b></p><p>If you already paid, this email does not itself confirm a refund. Any applicable refund will be handled according to the payment method and GENMERCH support process.</p><p>GENMERCH Customer Support</p></main><footer style="padding:14px;background:#faf7f5;font-size:11px;color:#8b7c73">Automated notification sent to '+esc(recipient)+'.</footer></div>';
  let resp:Response,payload:Record<string,unknown>={};try{resp=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+resend,"Content-Type":"application/json"},body:JSON.stringify({from,to:[recipient],subject:"GENMERCH order cancellation confirmation | "+o.order_number,html,text:textBody})});try{payload=await resp.json();}catch{}}catch(e){await db.rpc("finish_genmerch_cancellation_email",{p_order_id:id,p_status:"failed",p_provider_message_id:null,p_error:String(e)});return reply(502,{ok:false,message:"Order remains cancelled; email send failed."});}
  if(!resp.ok){const err=String(payload.message||payload.name||("Resend HTTP "+resp.status));await db.rpc("finish_genmerch_cancellation_email",{p_order_id:id,p_status:"failed",p_provider_message_id:null,p_error:err});return reply(502,{ok:false,message:"Order remains cancelled; email provider rejected the message."});}
  const {error:fe}=await db.rpc("finish_genmerch_cancellation_email",{p_order_id:id,p_status:"sent",p_provider_message_id:String(payload.id||""),p_error:null});if(fe)console.error("Email accepted but status update failed",fe.message);
  return reply(200,{ok:true,recipient_email:recipient,message_id:payload.id||""});
 }catch(e){console.error("Cancellation email handler error",e instanceof Error?e.message:"unknown");return reply(500,{ok:false,message:"Order remains cancelled; email could not be sent."});}
});