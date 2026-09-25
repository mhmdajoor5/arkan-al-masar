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
async function document(signal?:AbortSignal){const[{jsPDF},buf]=await Promise.all([import('jspdf'),fontData(signal)]);if(signal?.aborted)throw new DOMException('Aborted','AbortError');const pdf=new jsPDF();let raw='';new Uint8Array(buf).forEach(x=>raw+=String.fromCharCode(x));pdf.addFileToVFS('Arabic.ttf',btoa(raw));pdf.addFont('Arabic.ttf','Arabic','normal');pdf.setFont('Arabic');return pdf}
// Keep Allah as connected letters: the PDF font lacks jsPDF's U+FDF2 ligature.
function line(p:jsPDF,s:string,x:number,y:number,size=11){s=s.replace(/\ufdf2/g,'الله').replace(/الله/g,'ا\u200cلله');p.setFontSize(size);const ar=/[\u0600-\u06ff]/.test(s);p.setR2L(false);p.text(s,x,y,{align:ar?'right':'left'});p.setR2L(false)}
export async function ticketPDF(booking:any,stations:any[],buses:any[]=[],signal?:AbortSignal):Promise<Blob>{
if(!booking?.tickets?.length)throw new Error('PDF_NO_TICKETS');
const[p,{default:QR}]=await Promise.all([document(signal),import('qrcode')]);
const groups=passengerTickets(booking.tickets);
function right(text:string,x:number,y:number,size=11){p.setFontSize(size);p.setR2L(false);p.text(text.replace(/\ufdf2/g,'الله').replace(/الله/g,'ا\u200cلله'),x,y,{align:'right'})}
function wrapped(text:string,x:number,y:number,width:number,size=11,maxLines=2){p.setFontSize(size);const lines=p.splitTextToSize(text,width);lines.slice(0,maxLines).forEach((value:string,i:number)=>right(value,x,y+i*5,size))}
for(let i=0;i<groups.length;i++){
if(signal?.aborted)throw new DOMException('Aborted','AbortError');if(i)p.addPage();const legs=groups[i],passenger=legs[0];
p.setFillColor('#173f35');p.rect(0,0,210,34,'F');p.setTextColor('#ffffff');right('أركان المسار',192,17,22);right(legs.length>1?'تذكرة ذهاب وعودة':'تذكرة ذهاب',192,27,11);
p.setTextColor('#183328');right('رقم الحجز',192,44,9);line(p,booking.code,16,44,12);right(arabicStatus(booking.status),192,53,12);
wrapped((passengerTitles.find(x=>x.value===passenger.title)?.ar||'')+' '+passenger.name,192,65,176,14,2);
right(identityTypes.find(x=>x.value===passenger.identityType)?.ar||'وثيقة الهوية',192,80,10);line(p,passenger.maskedId||'—',16,80,11);
right(booking.paymentMethod==='cash'?'طريقة الدفع: نقدًا — كاش':'حالة الدفع: '+arabicStatus(booking.status),192,89,10);
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
export async function manifestPDF(trip:any,passengers:any[],driver:any,bus:any,stations:any[]){
const p=await document();
const heading=()=>{
  p.setTextColor('#173f35');line(p,'ARKAN AL-MASAR | TRIP MANIFEST',15,18,16);
  line(p,trip.date+'  |  '+trip.time+' (Saudi time)',15,29,10);
  p.setFontSize(10);let y=39;
  const route=(stations.find(s=>s.id===trip.from_station)?.en||trip.from_station)+' > '+(stations.find(s=>s.id===trip.to_station)?.en||trip.to_station);
  for(const text of p.splitTextToSize(route,178)){line(p,text,15,y,10);y+=5}
  y+=6;const busText='الحافلة: '+(bus?.name||trip.bus)+' · '+(bus?.plate||'')+' · '+(bus?.seats||trip.capacity||49)+' مقعدًا';for(const text of p.splitTextToSize(busText,178)){line(p,text,195,y,10);y+=5}line(p,'Driver ID: '+(driver?.nationalId||'-'),15,y,10);y+=9;
  line(p,driver?.name||'Driver not assigned',/[\u0600-\u06ff]/.test(driver?.name||'')?190:15,y,10);y+=13;
  p.setFillColor('#eee7db');p.rect(15,y-6,180,11,'F');
  line(p,'SEAT',18,y,9);line(p,'PASSENGER',35,y,9);line(p,'ID',120,y,9);line(p,'BOARDED',173,y,9);
  return y+13;
};
let y=heading();
for(const passenger of passengers){
  p.setFontSize(9);const nameLines=p.splitTextToSize(passenger.name,73);const height=Math.max(12,nameLines.length*4.5+5);
  if(y+height>278){p.addPage();y=heading()}
  line(p,String(passenger.seat),18,y,10);
  nameLines.forEach((text:string,index:number)=>line(p,text,/[\u0600-\u06ff]/.test(passenger.name)?110:35,y+index*4.5,9));
  line(p,passenger.national_id,120,y,9);line(p,passenger.boarded?'YES':'NO',178,y,9);
  y+=height;p.setDrawColor('#e7e9e2');p.line(15,y-6,195,y-6);
}
for(let page=1;page<=p.getNumberOfPages();page++){p.setPage(page);p.setTextColor('#74816f');line(p,'Page '+page+' / '+p.getNumberOfPages(),15,291,8)}
return p.output('blob');
}
