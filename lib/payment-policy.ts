export type PaymentMode='cash'|'online'|'both';

// gatewayReady is true once the MyFatoorah token is configured. If the admin chose "online only" and the
// gateway later becomes unavailable, cash is offered again so customers are never left without a way to pay.
export function paymentPolicy(settings:{paymentMode?:unknown},gatewayReady=false){
  const mode:PaymentMode=settings.paymentMode===undefined?'both':settings.paymentMode==='cash'?'cash':settings.paymentMode==='both'?'both':'online';
  const online=gatewayReady&&mode!=='cash';
  return {mode,cash:mode==='cash'||mode==='both'||!online,online,showOnline:mode!=='cash',onlineDiscountPercent:0,onlineReady:gatewayReady};
}
