'use client';
import {useState} from 'react';
import {CreditCard} from 'lucide-react';
import {api,errorMessage,useLocale} from '@/lib/arkan-client';

// The booking code and hold token are kept for the trip to MyFatoorah and back, so the return page can
// confirm the payment for this customer without asking for the mobile number again.
const KEY='arkan-online-payment';
export function savePaymentSession(code:string,token:string){try{sessionStorage.setItem(KEY,JSON.stringify({code,token}))}catch{}}
export function readPaymentSession():{code:string;token:string}|null{try{const v=JSON.parse(sessionStorage.getItem(KEY)||'null');return v&&typeof v.code==='string'&&typeof v.token==='string'?v:null}catch{return null}}

export async function startOnlinePayment(code:string,token:string,en:boolean){
  savePaymentSession(code,token);
  const result=await api('startPayment',{code,token,lang:en?'en':'ar'});
  if(result.paid)return true;
  window.location.assign(result.url);
  return false;
}

export function paymentReturn(){
  if(typeof window==='undefined')return null;
  const p=new URLSearchParams(window.location.search);
  return p.get('payment')==='return'&&p.get('code')?String(p.get('code')).toUpperCase():null;
}

export function OnlinePaymentNotice({booking,token,onPaid}:{booking:any;token?:string;onPaid?:(b:any)=>void}){
  const {en,t}=useLocale();const[busy,setBusy]=useState(false),[error,setError]=useState('');
  if(booking?.paymentMethod!=='online')return null;
  if(booking.status==='paid')return <p className="online-paid" role="status"><CreditCard size={18}/>{t('تم الدفع إلكترونيًا بنجاح، وحجزك مؤكد.','Paid online. Your booking is confirmed.')}{booking.onlinePayment?.test&&<small> {t('(بيئة اختبار)','(test mode)')}</small>}</p>;
  if(booking.status!=='pending')return <p className="error" role="alert">{booking.refund==='required'?t('وصل الدفع بعد انتهاء مهلة الحجز. سيتواصل معك فريقنا لاسترداد المبلغ.','Your payment arrived after the booking expired. Our team will contact you about a refund.'):t('انتهت مهلة الدفع وأُلغي الحجز. يمكنك الحجز من جديد.','The payment window ended and the booking was cancelled. You can book again.')}</p>;
  const access=token||readPaymentSession()?.token;
  async function pay(){if(!access)return;setBusy(true);setError('');try{const paid=await startOnlinePayment(booking.code,access,en);if(paid&&onPaid)onPaid(await api('verifyPayment',{code:booking.code,token:access}))}catch(e){setError(errorMessage(e,en))}finally{setBusy(false)}}
  async function check(){if(!access)return;setBusy(true);setError('');try{const b=await api('verifyPayment',{code:booking.code,token:access});if(onPaid)onPaid(b);if(b.status!=='paid')setError(t('لم يصل تأكيد الدفع بعد.','Payment has not been confirmed yet.'))}catch(e){setError(errorMessage(e,en))}finally{setBusy(false)}}
  return <div className="online-pending panel" role="status">
    <h2><CreditCard size={20}/>{t('الدفع لم يكتمل بعد','Payment not completed yet')}</h2>
    <p>{t('مقاعدك محجوزة لمدة 30 دقيقة من وقت الحجز. أكمل الدفع خلالها، وإلا تُلغى تلقائيًا.','Your seats are held for 30 minutes from booking. Complete payment within that time or they are released.')}</p>
    {access?<div className="payment-actions"><button className="primary" type="button" disabled={busy} onClick={()=>void pay()}>{busy?t('جارٍ التحويل…','Redirecting…'):t('إكمال الدفع','Complete payment')}</button><button className="secondary" type="button" disabled={busy} onClick={()=>void check()}>{t('دفعت؟ تحقّق الآن','Paid? Check now')}</button></div>:<p className="muted">{t('افتح الحجز من نفس الجهاز الذي حجزت منه لإكمال الدفع، أو تواصل معنا.','Open the booking on the device you booked from to complete payment, or contact us.')}</p>}
    {error&&<p className="error" role="alert">{error}</p>}
  </div>;
}
