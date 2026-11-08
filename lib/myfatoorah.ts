import {z} from 'zod';
import {db,fail,bookingResult,cancelBooking,rateLimit} from './arkan-server';
import {gatewayConfig} from './myfatoorah-config';

// Online payment through MyFatoorah's hosted payment page (mada, Apple Pay, Visa/Mastercard, STC Pay —
// whatever the merchant account enables).
//
// Flow: confirm() creates the booking as "pending" with paymentMethod "online" and books the seats.
// startPayment() creates a MyFatoorah invoice and returns its payment URL. When the customer comes back
// (callback/error URL), a webhook arrives, or the booking is looked up, reconcile() asks MyFatoorah for the
// invoice status with our own token. Nothing the browser or the webhook sends is trusted as proof of payment.
// Unpaid online bookings release their seats after PAYMENT_WINDOW.

export const PAYMENT_WINDOW=30*60*1000;
const codeSchema=z.string().trim().toUpperCase().regex(/^AM-[0-9A-F]{12}$/);
const tokenSchema=z.string().min(64).max(100);
const now=()=>Date.now();

async function gateway(path:string,body:unknown){
  const config=gatewayConfig();
  if(!config.ready)fail('PAYMENT_GATEWAY_NOT_READY',409);
  let response:Response;
  try{
    response=await fetch(config.base+path,{method:'POST',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
  }catch(error){console.error('myfatoorah',path,'network',String(error));fail('PAYMENT_GATEWAY_ERROR',502)}
  let data:any=null;try{data=await response!.json()}catch{}
  if(!response!.ok||!data?.IsSuccess){
    console.error('myfatoorah',path,response!.status,data?.Message||'',JSON.stringify(data?.ValidationErrors||[]).slice(0,500));
    fail('PAYMENT_GATEWAY_ERROR',502);
  }
  return data.Data;
}

async function load(code:string){
  const booking=await db().prepare('SELECT code,hold_token,mobile,email,amount,status,created,refund FROM bookings WHERE code=?').bind(code).first<any>();
  const row=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='booking_metadata'").bind('booking:'+code).first<{data:string}>();
  return {booking,raw:row?.data||'',metadata:row?JSON.parse(row.data):{}};
}

// Compare-and-swap on the metadata row so two concurrent requests cannot overwrite each other's payment record.
async function saveMetadata(code:string,before:string,next:unknown){
  const result=await db().prepare("UPDATE entities SET data=? WHERE id=? AND kind='booking_metadata' AND data=?").bind(JSON.stringify(next),'booking:'+code,before).run();
  return !!result.meta.changes;
}

function customerName(name:string){return name.trim().slice(0,100)||'Customer'}

export async function startPayment(body:any,req:Request){
  await rateLimit(req,'payment-start',20);
  const b=z.object({code:codeSchema,token:tokenSchema,lang:z.enum(['ar','en']).default('ar')}).parse(body);
  const {booking,raw,metadata}=await load(b.code);
  if(!booking||booking.hold_token!==b.token)fail('BOOKING_NOT_FOUND',404);
  if(metadata.paymentMethod!=='online')fail('PAYMENT_METHOD_UNAVAILABLE',409);
  if(booking.status==='paid')return {paid:true};
  if(booking.status!=='pending')fail('PAYMENT_EXPIRED',409);
  const expires=Number(booking.created)+PAYMENT_WINDOW;
  if(expires<=now()+60000)fail('PAYMENT_EXPIRED',409);
  // Reuse an invoice that is still open instead of creating a second one for the same booking.
  if(metadata.payment?.invoiceId&&metadata.payment?.url)return {url:metadata.payment.url};
  const passenger=await db().prepare('SELECT name FROM tickets WHERE booking_code=? ORDER BY seat LIMIT 1').bind(b.code).first<{name:string}>();
  const origin=new URL(req.url).origin;
  const back=origin+'/?payment=return&code='+encodeURIComponent(b.code);
  const config=gatewayConfig();
  const invoice=await gateway('/v2/SendPayment',{
    NotificationOption:'LNK',
    CustomerName:customerName(passenger?.name||''),
    InvoiceValue:Number((booking.amount/100).toFixed(2)),
    DisplayCurrencyIso:'SAR',
    MobileCountryCode:'+966',
    CustomerMobile:String(booking.mobile).replace(/^966/,''),
    CustomerEmail:booking.email,
    CallBackUrl:back,
    ErrorUrl:back,
    Language:b.lang,
    CustomerReference:b.code,
    UserDefinedField:b.code,
    InvoiceItems:[{ItemName:'Arkan Al Masar booking '+b.code,Quantity:1,UnitPrice:Number((booking.amount/100).toFixed(2))}]
  });
  const invoiceId=String(invoice?.InvoiceId||''),url=String(invoice?.InvoiceURL||'');
  if(!invoiceId||!/^https:\/\//.test(url))fail('PAYMENT_GATEWAY_ERROR',502);
  const next={...metadata,payment:{provider:'myfatoorah',invoiceId,url,created:now(),expires,test:config.test}};
  if(!await saveMetadata(b.code,raw,next)){
    // Another request saved an invoice first; send the customer to that one.
    const latest=await load(b.code);
    if(latest.metadata.payment?.url)return {url:latest.metadata.payment.url};
    fail('PAYMENT_GATEWAY_ERROR',409);
  }
  return {url};
}

// Ask MyFatoorah for the invoice status and record a confirmed payment. Safe to call any number of times.
export async function reconcile(code:string){
  const key=codeSchema.parse(code);
  const {booking,raw,metadata}=await load(key);
  if(!booking||metadata.paymentMethod!=='online'||!metadata.payment?.invoiceId)return {status:booking?.status||'missing'};
  if(booking.status==='paid'&&metadata.payment.paidAt)return {status:'paid'};
  const data=await gateway('/v2/getPaymentStatus',{Key:metadata.payment.invoiceId,KeyType:'InvoiceId'});
  const paid=String(data?.InvoiceStatus||'').toLowerCase()==='paid';
  const matches=String(data?.CustomerReference||data?.UserDefinedField||'')===key&&String(data?.InvoiceId||'')===String(metadata.payment.invoiceId);
  const value=Math.round(Number(data?.InvoiceValue||0)*100);
  if(!paid)return {status:booking.status};
  if(!matches||value<booking.amount){
    console.error('myfatoorah','payment mismatch',key,data?.InvoiceId,value,booking.amount);
    return {status:booking.status};
  }
  const transaction=(data?.InvoiceTransactions||[]).find((t:any)=>/succ/i.test(String(t?.TransactionStatus||'')))||{};
  const at=now(),eventId=crypto.randomUUID();
  const event={id:eventId,from:booking.status,to:booking.status==='pending'?'paid':booking.status,at,actor:'MyFatoorah',provider:'myfatoorah',invoiceId:String(data.InvoiceId),paymentId:String(transaction.PaymentId||''),gateway:String(transaction.PaymentGateway||'')};
  const next={...metadata,payment:{...metadata.payment,paidAt:at,paymentId:event.paymentId,gateway:event.gateway},paymentEvents:[...(metadata.paymentEvents||[]),event]};
  if(booking.status==='pending'){
    // Both writes are conditional on the metadata still being what we read, so a concurrent reconcile or a
    // manual change in between makes this one a no-op instead of a double entry.
    const results=await db().batch([
      db().prepare("UPDATE entities SET data=? WHERE id=? AND kind='booking_metadata' AND data=? AND EXISTS(SELECT 1 FROM bookings WHERE code=? AND status='pending')").bind(JSON.stringify(next),'booking:'+key,raw,key),
      db().prepare("UPDATE bookings SET status='paid' WHERE code=? AND status='pending' AND EXISTS(SELECT 1 FROM entities WHERE id=? AND json_extract(data,'$.paymentEvents[#-1].id')=?)").bind(key,'booking:'+key,eventId)
    ]);
    return {status:results[1].meta.changes?'paid':(await load(key)).booking.status};
  }
  // Paid after the booking was released (or cancelled): keep the record and flag it for a refund.
  if(!metadata.payment.paidAt){
    await db().batch([
      db().prepare("UPDATE entities SET data=? WHERE id=? AND kind='booking_metadata' AND data=?").bind(JSON.stringify({...next,paymentEvents:[...(metadata.paymentEvents||[]),{...event,to:'refund_required',note:'paid_after_release'}]}),'booking:'+key,raw),
      db().prepare("UPDATE bookings SET refund='required' WHERE code=? AND status<>'paid'").bind(key)
    ]);
  }
  return {status:booking.status,refund:'required'};
}

// Called by the customer's browser after MyFatoorah redirects back.
export async function verifyPayment(body:any,req:Request){
  await rateLimit(req,'payment-verify',30);
  const b=z.object({code:codeSchema,token:tokenSchema}).parse(body);
  const {booking}=await load(b.code);
  if(!booking||booking.hold_token!==b.token)fail('BOOKING_NOT_FOUND',404);
  await reconcile(b.code);
  return bookingResult(b.code,true);
}

// MyFatoorah webhook. The body only tells us which booking to re-check; the status always comes from the API.
export async function paymentWebhook(req:Request){
  await rateLimit(req,'payment-webhook',120);
  const text=(await req.text()).slice(0,20000);
  const codes=[...new Set(text.toUpperCase().match(/AM-[0-9A-F]{12}/g)||[])].slice(0,3);
  for(const code of codes){try{await reconcile(code)}catch(error){console.error('myfatoorah webhook',code,String(error))}}
  return {ok:true};
}

export async function adminReconcile(code:string){return reconcile(code)}

// Release seats held by online bookings that were never paid. Each one is re-checked with MyFatoorah first,
// so a payment whose redirect or webhook was lost is still recorded instead of being cancelled.
let lastSweep=0;
export async function releaseUnpaidOnline(force=false){
  if(!force&&now()-lastSweep<120000)return {released:0};
  lastSweep=now();
  const rows=(await db().prepare("SELECT b.code FROM bookings b JOIN entities e ON e.id='booking:'||b.code AND e.kind='booking_metadata' WHERE b.status='pending' AND json_extract(e.data,'$.paymentMethod')='online' AND b.created<? ORDER BY b.created LIMIT 20").bind(now()-PAYMENT_WINDOW).all<{code:string}>()).results;
  let released=0;
  for(const row of rows){
    try{
      const {metadata}=await load(row.code);
      if(metadata.payment?.invoiceId&&gatewayConfig().ready&&(await reconcile(row.code)).status==='paid')continue;
      await cancelBooking(row.code);released++;
    }catch(error){console.error('myfatoorah release',row.code,String(error))}
  }
  return {released};
}
