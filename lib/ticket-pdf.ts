import {attendance,passengerTickets,passengerTitles,identityTypes,arabicStatus} from './ticket-details';
import type {jsPDF} from 'jspdf';
async function fontData(signal?:AbortSignal){
  const controller=new AbortController();
  const abort=()=>controller.abort();
  if(signal?.aborted)abort();
  signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(abort,20000);
  try{
    const response=await fetch('/fonts/Arabic.ttf',{signal:controller.signal});
    if(!response.ok)throw new Error('PDF_FONT_UNAVAILABLE');
    const buffer=await response.arrayBuffer();
    if(buffer.byteLength<4)throw new Error('PDF_FONT_INVALID');
    const signature=new DataView(buffer).getUint32(0);
    if(signature!==0x00010000&&signature!==0x4f54544f)throw new Error('PDF_FONT_INVALID');
    return buffer;
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
export async function document(signal?:AbortSignal){const[{jsPDF},buf]=await Promise.all([import('jspdf'),fontData(signal)]);if(signal?.aborted)throw new DOMException('Aborted','AbortError');const pdf=new jsPDF();let raw='';new Uint8Array(buf).forEach(x=>raw+=String.fromCharCode(x));pdf.addFileToVFS('Arabic.ttf',btoa(raw));pdf.addFont('Arabic.ttf','Arabic','normal');pdf.setFont('Arabic');return pdf}
// Keep Allah as connected letters: the PDF font lacks jsPDF's U+FDF2 ligature.
function line(p:jsPDF,s:string,x:number,y:number,size=11){s=s.replace(/\ufdf2/g,'الله').replace(/الله/g,'ا\u200cلله');p.setFontSize(size);const ar=/[\u0600-\u06ff]/.test(s);p.setR2L(false);p.text(s,x,y,{align:ar?'right':'left'});p.setR2L(false)}
export async function ticketPDF(booking:any,stations:any[],buses:any[]=[],signal?:AbortSignal):Promise<Blob>{
if(!booking?.tickets?.length)throw new Error('PDF_NO_TICKETS');
const[p,{default:QR}]=await Promise.all([document(signal),import('qrcode')]);
const groups=passengerTickets(booking.tickets);
function right(text:string,x:number,y:number,size=11){p.setFontSize(size);p.setR2L(false);p.text(text.replace(/\ufdf2/g,'الله').replace(/الله/g,'ا\u200cلله'),x,y,{align:'right'})}
function wrapped(text:string,x:number,y:number,width:number,size=11,maxLines=2){p.setFontSize(size);const lines=p.splitTextToSize(text,width);lines.slice(0,maxLines).forEach((value:string,i:number)=>right(value,x,y+i*5,size))}
if(booking.package){const v=booking.package;p.setTextColor('#173f35');right('أركان المسار — ملخص باقة النقل والإقامة',192,22,18);line(p,booking.code,16,35,12);right((booking.paymentMethod==='sponsored'&&booking.status==='paid'?'مؤكد — ضيافة فاعل خير':arabicStatus(booking.status)),192,35,12);const rows=[v.name,'الفندق: '+v.hotel,'نوع الغرفة: '+v.roomType,'الغرف: '+v.rooms+' — عدد الليالي: '+v.nights,'الدخول: '+v.checkIn,'المغادرة: '+v.checkOut,'عدد المسافرين: '+v.people,'سعر المسافر شامل النقل: '+v.personPrice+' ريال','سعر الغرفة لكامل الإقامة: '+v.roomPrice+' ريال','الإجمالي: '+(v.amount/100).toFixed(2)+' ريال','طريقة الدفع: نقدًا — كاش'];rows.forEach((text,i)=>wrapped(String(text),192,54+i*15,178,12,2));if(v.terms)wrapped('شروط الباقة: '+v.terms,192,228,178,10,8);p.addPage();}
for(let i=0;i<groups.length;i++){
if(signal?.aborted)throw new DOMException('Aborted','AbortError');if(i)p.addPage();const legs=groups[i],passenger=legs[0];
p.setFillColor('#173f35');p.rect(0,0,210,34,'F');p.setTextColor('#ffffff');right('أركان المسار',192,17,22);right(legs.length>1?'تذكرة ذهاب وعودة':'تذكرة ذهاب',192,27,11);
p.setTextColor('#183328');right('رقم الحجز',192,44,9);line(p,booking.code,16,44,12);right((booking.paymentMethod==='sponsored'&&booking.status==='paid'?'مؤكد — ضيافة فاعل خير':arabicStatus(booking.status)),192,53,12);
wrapped((passengerTitles.find(x=>x.value===passenger.title)?.ar||'')+' '+passenger.name,192,65,176,14,2);
right(identityTypes.find(x=>x.value===passenger.identityType)?.ar||'وثيقة الهوية',192,80,10);line(p,passenger.maskedId||'—',16,80,11);
right(booking.paymentMethod==='sponsored'?'ضيافة فاعل خير — المبلغ المستحق: ٠ ريال':booking.paymentMethod==='cash'?'طريقة الدفع: نقدًا — كاش':'حالة الدفع: '+(booking.paymentMethod==='sponsored'&&booking.status==='paid'?'مؤكد — ضيافة فاعل خير':arabicStatus(booking.status)),192,89,10);
for(let j=0;j<legs.length;j++){
const ticket=legs[j],at=attendance(ticket.date,ticket.time),y=98+j*80;
p.setFillColor('#f3f5ef');p.roundedRect(14,y,182,75,3,3,'F');right(j?'رحلة العودة':'رحلة الذهاب',190,y+9,13);
const station=(key:string)=>stations.find(s=>s.id===key)?.ar||key;
right('من',190,y+18,8);wrapped(station(ticket.from_station),190,y+24,117,10);
right('إلى',190,y+37,8);wrapped(station(ticket.to_station),190,y+43,117,10);
right('تاريخ الرحلة',190,y+57,8);right(ticket.date,190,y+64,10);
right('الحضور',151,y+57,8);right(at.time,151,y+64,11);
if(at.date!==ticket.date)right(at.date,151,y+70,7);
right('الانطلاق',118,y+57,8);right(ticket.time,118,y+64,11);
right('المقعد',83,y+57,8);right(String(ticket.seat),83,y+64,11);
p.addImage(await QR.toDataURL(ticket.id,{width:400,margin:2}),'PNG',18,y+8,43,43);
right('الحافلة',59,y+57,8);wrapped(String([ticket.bus_name,ticket.bus_plate].filter(Boolean).join(' · ')||buses.find(b=>b.id===ticket.bus)?.plate||ticket.bus),59,y+64,37,8,2);
right('رمز الصعود اليدوي',190,y+73,6);line(p,ticket.id,18,y+73,5.5);
}
p.setTextColor('#53614b');right('جميع المواعيد بتوقيت السعودية. الحضور قبل الانطلاق بساعة.',192,266,9);
right(booking.status==='paid'?'أبرز التذكرة ووثيقة الهوية الأصلية عند الصعود.':booking.status==='cancelled'?'التذكرة ملغاة وغير صالحة للصعود.':'يلزم تأكيد استلام الدفع من الإدارة قبل السماح بالصعود.',192,274,9);
right('الشركة غير مسؤولة عن أي أغراض تُترك داخل الحافلة.',192,282,9);
}return p.output('blob')}
export async function manifestPDF(trip:any,passengers:any[],driver:any,bus:any,stations:any[],company?:import('./company-profile').CompanyProfile){
 const {arabicManifestPDF}=await import('./invoice-pdf');return arabicManifestPDF(trip,passengers,driver,bus,stations,company);
}
