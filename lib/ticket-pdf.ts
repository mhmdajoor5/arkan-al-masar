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
export async function ticketPDF(booking:any,stations:any[],buses:any[]=[],signal?:AbortSignal):Promise<Blob>{if(!booking?.tickets?.length)throw new Error('PDF_NO_TICKETS');const[p,{default:QR}]=await Promise.all([document(signal),import('qrcode')]);for(let i=0;i<booking.tickets.length;i++){if(signal?.aborted)throw new DOMException('Aborted','AbortError');if(i)p.addPage();const t=booking.tickets[i],station=(key:string)=>stations.find(s=>s.id===key)?.en||key;p.setFillColor('#173f35');p.rect(0,0,210,38,'F');p.setTextColor('#ffffff');line(p,'ARKAN AL-MASAR',18,20,22);line(p,'أركان المسار',192,32,15);p.setTextColor('#183328');line(p,booking.status==='test'?'TEST TICKET - NO PAYMENT':'BOOKING REQUEST SUMMARY',18,52,12);line(p,booking.code,18,63,15);line(p,t.name,/[\u0600-\u06ff]/.test(t.name)?190:18,80,17);const rows=[['ID',t.maskedId],['From',station(t.from_station)],['To',station(t.to_station)],['Date',t.date],['Departure (Saudi time)',t.time],['Seat',String(t.seat)],['Bus',t.bus_plate||buses.find(b=>b.id===t.bus)?.plate||t.bus],['Booking status',booking.status==='cancelled'?'Cancelled':booking.status==='test'?'Test ticket - no payment':booking.status==='paid'?'Paid and confirmed':'Awaiting payment and confirmation']];rows.forEach(([k,v],j)=>{line(p,k,18,99+j*12);line(p,String(v),90,99+j*12)});p.addImage(await QR.toDataURL(t.id,{width:400,margin:2}),'PNG',75,205,60,60);line(p,'Ticket code for manual entry',18,272,9);line(p,'رمز التذكرة للإدخال اليدوي',192,272,9);line(p,t.id,18,279,8);line(p,booking.status==='test'?'Boarding rehearsal only. No payment collected. Not valid for passenger travel.':booking.status==='paid'?'Keep this booking reference private. Arrive 20 minutes before departure.':booking.status==='cancelled'?'This booking has been cancelled. This summary cannot be used for boarding.':'Keep this booking reference private. Payment and confirmation are required.',18,286,9)}return p.output('blob')}
export async function manifestPDF(trip:any,passengers:any[],driver:any,bus:any,stations:any[]){
const p=await document();
const heading=()=>{
  p.setTextColor('#173f35');line(p,'ARKAN AL-MASAR | TRIP MANIFEST',15,18,16);
  line(p,trip.date+'  |  '+trip.time+' (Saudi time)',15,29,10);
  p.setFontSize(10);let y=39;
  const route=(stations.find(s=>s.id===trip.from_station)?.en||trip.from_station)+' > '+(stations.find(s=>s.id===trip.to_station)?.en||trip.to_station);
  for(const text of p.splitTextToSize(route,178)){line(p,text,15,y,10);y+=5}
  y+=6;line(p,'Bus: '+(bus?.plate||trip.bus)+' | Driver ID: '+(driver?.nationalId||'-'),15,y,10);y+=9;
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
