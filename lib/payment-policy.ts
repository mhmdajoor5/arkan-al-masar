export type PaymentMode='cash'|'online'|'both';
export function paymentPolicy(settings:{paymentMode?:unknown}){
  const mode:PaymentMode=settings.paymentMode===undefined?'both':settings.paymentMode==='cash'?'cash':settings.paymentMode==='both'?'both':'online';
  return {mode,cash:mode==='cash'||mode==='both',online:false,showOnline:mode!=='cash',onlineDiscountPercent:5,onlineReady:false};
}
