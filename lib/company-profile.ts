/** Public issuer information; invoice copies retain their own immutable snapshot. */
export const companyDefaults={
 companyName:'شركة أركان المسار للنقليات',taxNumber:'314923464900003',
 companyRegistration:'7054864942',companyAddress:'مكة المكرمة، حي الزهراء، 59 الزهراء الوسطى، 24221',
 snapchat:'arkanalmasar',tiktok:'arkanalmasar',vatRate:15,
};
export function companyProfile(settings:Record<string,any>={}){
 return {...companyDefaults,...Object.fromEntries(Object.keys(companyDefaults).filter(k=>settings[k]!==undefined).map(k=>[k,settings[k]])),
 phone:String(settings.whatsapp||'966594460077'),email:String(settings.contactEmail||'')};
}
export type CompanyProfile=ReturnType<typeof companyProfile>;
export function vatIncluded(total:number){
 if(!Number.isSafeInteger(total)||total<0)throw new Error('INVALID_AMOUNT');
 const subtotal=Math.round(total*100/115);return{subtotal,vat:total-subtotal,total,rate:15};
}
