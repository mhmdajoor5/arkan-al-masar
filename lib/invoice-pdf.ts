import {document} from './ticket-pdf';
import type {jsPDF} from 'jspdf';
import {companyProfile,type CompanyProfile} from './company-profile';
const amount=(v:number)=>(v/100).toFixed(2);
function right(p:jsPDF,text:string,x:number,y:number,size=10){p.setFontSize(size);p.setR2L(false);p.text(String(text).replace(/الله/g,'ا\u200cلله'),x,y,{align:'right'})}
function fit(p:jsPDF,text:string,x:number,y:number,size=16){p.setFontSize(size);while(p.getTextWidth(text)>178&&size>6){size-=0.5;p.setFontSize(size)}right(p,text,x,y,size)}
function wrap(p:jsPDF,text:string,x:number,y:number,width=174,size=10){p.setFontSize(size);const lines=p.splitTextToSize(String(text),width);for(const line of lines){right(p,line,x,y,size);y+=6}return y}
export function invoiceNumber(sequence:number){return 'AM-INV-'+String(sequence).padStart(8,'0')}
export function invoiceQR(invoice:any){
 const values=[invoice.seller.companyName,invoice.seller.taxNumber,new Date(invoice.issuedAt).toISOString(),amount(invoice.total),amount(invoice.vat)];
 const bytes:number[]=[];values.forEach((v,i)=>{const encoded=new TextEncoder().encode(v);if(encoded.length>255)throw new Error('INVALID_INPUT');bytes.push(i+1,encoded.length,...encoded)});return btoa(String.fromCharCode(...bytes));
}
export function companyFooter(p:jsPDF,company:CompanyProfile,page:number,pages:number){
 p.setDrawColor('#dce3d8');p.line(16,268,194,268);p.setTextColor('#53614b');
 const contact=[company.phone,company.email].filter(Boolean).join('   |   ');
 let contactSize=8;p.setFontSize(contactSize);while(p.getTextWidth(contact)>178&&contactSize>5){contactSize-=0.5;p.setFontSize(contactSize)}p.text(contact,105,275,{align:'center'});p.setFontSize(8);
 p.text([company.snapchat?'Snapchat: '+company.snapchat:'',company.tiktok?'TikTok: '+company.tiktok:''].filter(Boolean).join('   |   '),105,281,{align:'center'});
 right(p,'صفحة '+page+' / '+pages,194,290,8);
}
export async function invoicePDF(data:any):Promise<Blob>{
 const i=data.invoice,p=await document(),company=i.seller;const{default:QR}=await import('qrcode');
 p.setFillColor('#173f35');p.rect(0,0,210,32,'F');p.setTextColor('#fff');fit(p,company.companyName,194,15,17);right(p,'فاتورة',194,25,11);
 p.setTextColor('#243c2a');p.setFontSize(10);p.text(invoiceNumber(i.sequence),16,42);right(p,'رقم الفاتورة',194,42);
 const date=new Date(i.issuedAt+10800000).toISOString().slice(0,19).replace('T',' ');
 right(p,'تاريخ الإصدار: '+date+' — توقيت السعودية',194,50,9);
 right(p,'الرقم الضريبي: '+company.taxNumber,194,58,10);right(p,'السجل / الرقم الموحد: '+company.companyRegistration,194,65,9);
 let y=wrap(p,'العنوان: '+company.companyAddress,194,73,178,9)+3;
 p.setFontSize(11);const customerLines=p.splitTextToSize('العميل: '+i.customer.name,166);const customerHeight=26+customerLines.length*6;
 p.setFillColor('#f3f5ef');p.roundedRect(16,y,178,customerHeight,3,3,'F');
 customerLines.forEach((s:string,n:number)=>right(p,s,188,y+9+n*6,11));right(p,'رقم الحجز: '+i.bookingCode,188,y+9+customerLines.length*6,10);
 p.setFontSize(9);p.text(i.customer.mobile,22,y+customerHeight-6);right(p,'طريقة الدفع: نقدًا — كاش',188,y+customerHeight-6,9);y+=customerHeight+10;
 right(p,'تفاصيل الخدمة',194,y,12);y+=8;
 y=wrap(p,i.description,194,y,178,11)+2;
 for(const d of i.details){if(y>206){p.addPage();p.setTextColor('#243c2a');fit(p,company.companyName,194,18,14);right(p,invoiceNumber(i.sequence),194,28,10);y=40}y=wrap(p,d,194,y,178,9)}
 if(y>181){p.addPage();p.setTextColor('#243c2a');fit(p,company.companyName,194,18,14);right(p,invoiceNumber(i.sequence),194,28,10);y=40}
 y+=5;p.setFillColor('#f3f5ef');p.roundedRect(90,y,104,42,3,3,'F');
 right(p,'المبلغ قبل الضريبة: '+amount(i.subtotal)+' ر.س',188,y+10,11);
 right(p,'ضريبة القيمة المضافة ١٥٪: '+amount(i.vat)+' ر.س',188,y+22,11);
 right(p,'الإجمالي شامل الضريبة: '+amount(i.total)+' ر.س',188,y+35,12);
 p.addImage(await QR.toDataURL(invoiceQR(i),{width:350,margin:2}),'PNG',16,y,38,38);
 right(p,'رمز بيانات الفاتورة',57,y+43,8);y+=54;
 right(p,'حالة الدفع الحالية: '+(data.paymentStatus==='paid'?'مدفوع':'غير مدفوع'),194,y,10);y+=7;
 if(data.bookingStatus==='cancelled'){right(p,'الحجز ملغى — هذه النسخة لا تثبت استرداد المبلغ.',194,y,9);y+=7}
 if(data.paymentStatus!=='paid'){right(p,'هذه الفاتورة لا تثبت استلام المبلغ.',194,y,9);y+=7}
 right(p,'الكميات: حجز واحد. التفاصيل أعلاه تشمل جميع خدمات الحجز.',194,y,8);
 for(let page=1;page<=p.getNumberOfPages();page++){p.setPage(page);companyFooter(p,company,page,p.getNumberOfPages())}
 return p.output('blob');
}
export async function arabicManifestPDF(trip:any,passengers:any[],driver:any,bus:any,stations:any[],profile?:CompanyProfile){
 const p=await document(),company=profile||companyProfile();
 const heading=()=>{
  p.setTextColor('#173f35');fit(p,company.companyName,194,17,16);right(p,'كشف الركاب',194,27,13);
  right(p,'الرقم الضريبي: '+company.taxNumber+' — ضريبة القيمة المضافة ١٥٪',194,36,9);
  right(p,'السجل / الرقم الموحد: '+company.companyRegistration,194,44,9);
  let y=wrap(p,company.companyAddress,194,52,178,8)+4;
  right(p,'الرحلة: '+trip.date+' — الانطلاق: '+trip.time+' — توقيت السعودية',194,y,10);y+=8;
  const station=(id:string)=>stations.find(s=>s.id===id)?.ar||id;
  y=wrap(p,station(trip.from_station)+' ← '+station(trip.to_station),194,y,178,10)+2;
  y=wrap(p,'الحافلة: '+(bus?.name||trip.bus)+' — '+(bus?.plate||'')+' — '+(bus?.seats||trip.capacity||49)+' مقعدًا',194,y,178,10);
  y=wrap(p,'السائق: '+(driver?.name||'غير معيّن')+' — الهوية: '+(driver?.nationalId||'—'),194,y,178,10)+7;
  p.setFillColor('#eee7db');p.rect(16,y-6,178,11,'F');
  right(p,'المقعد',190,y,9);right(p,'اسم المسافر',168,y,9);right(p,'رقم الهوية',105,y,9);right(p,'جوال العميل / الإضافي',73,y,8);right(p,'الصعود',29,y,8);return y+12;
 };
 let y=heading();
 for(const passenger of passengers){p.setFontSize(9);const lines=p.splitTextToSize(passenger.name,54),height=Math.max(passenger.additionalMobile?17:11,lines.length*5+4);if(y+height>260){p.addPage();y=heading()}
  right(p,String(passenger.seat),188,y,10);lines.forEach((s:string,n:number)=>right(p,s,168,y+n*5,9));right(p,passenger.national_id||'—',105,y,8);right(p,passenger.mobile||'—',73,y,8);if(passenger.additionalMobile)right(p,passenger.additionalMobile,73,y+5,8);right(p,passenger.boarded?'نعم':'لا',27,y,8);y+=height;p.setDrawColor('#e7e9e2');p.line(16,y-5,194,y-5);
 }
 if(y+8<263)right(p,'عدد الركاب: '+passengers.length+' — صعد: '+passengers.filter(v=>v.boarded).length,194,y+4,10);
 for(let page=1;page<=p.getNumberOfPages();page++){p.setPage(page);companyFooter(p,company,page,p.getNumberOfPages())}
 return p.output('blob');
}
