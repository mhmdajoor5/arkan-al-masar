import {z} from 'zod';
import {db,settings,now,fail,mobile,rateLimit} from './arkan-server';
import {requireStaff} from './operations-auth';
import {companyProfile,vatIncluded} from './company-profile';

/** One stored, immutable invoice per booking. All values come from persisted bookings. */
export async function bookingInvoice(body:any,req:Request){
 await rateLimit(req,'invoice',30);
 const b=z.object({code:z.string().trim().min(3).max(100).transform(v=>v.toUpperCase()),mobile:z.string().max(30).optional(),asAdmin:z.boolean().optional()}).parse(body);
 if(b.asAdmin)await requireStaff(['admin']);
 const isPrivate=b.code.startsWith('PV-');
 const row=isPrivate?await db().prepare("SELECT id,data FROM entities WHERE kind='private_booking' AND json_extract(data,'$.code')=?").bind(b.code).first<any>():await db().prepare('SELECT code,mobile,email,amount,status,created FROM bookings WHERE code=?').bind(b.code).first<any>();
 const source=isPrivate?(row?JSON.parse(row.data):null):row;
 if(!source||(!b.asAdmin&&(!b.mobile||mobile(b.mobile)!==source.mobile)))fail('BOOKING_NOT_FOUND',404);
 const key='invoice:'+b.code;
 const existing=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='invoice'").bind(key).first<any>();
 const state={bookingStatus:source.status,paymentStatus:isPrivate?(source.paymentStatus||'unpaid'):(source.status==='paid'?'paid':'unpaid'),checkedAt:now()};
 if(existing)return{invoice:JSON.parse(existing.data),...state};
 if(isPrivate?!['confirmed','in_transit','completed'].includes(source.status)||source.price===null:!['pending','paid'].includes(source.status))fail('INVOICE_NOT_READY',409);
 const seller=companyProfile(await settings());
 if(!seller.companyName||!/^3\d{13}3$/.test(seller.taxNumber)||!seller.companyAddress)fail('INVOICE_COMPANY_REQUIRED',409);
 const total=isPrivate?source.price:source.amount;
 const details:string[]=[];
 let name=source.name||'',description='',people=source.passengers||1;
 if(isPrivate){
  description='حجز حافلة خاصة — '+source.capacity+' مقعدًا — '+(source.round?'ذهاب وعودة':'ذهاب فقط');
  details.push('عدد الركاب: '+people,'الذهاب: '+source.date+' '+source.time,'من: '+source.pickup,'إلى: '+source.destination);
  if(source.round)details.push('العودة: '+source.returnDate+' '+source.returnTime);
 }else{
  const tickets=(await db().prepare('SELECT k.name,k.trip_id,k.seat,t.date,t.time,t.from_station,t.to_station FROM tickets k JOIN trips t ON t.id=k.trip_id WHERE k.booking_code=? ORDER BY t.starts,k.seat').bind(b.code).all<any>()).results;
  if(!tickets.length)fail('INVOICE_NOT_READY',409);
  const legs=[...new Set(tickets.map(t=>t.trip_id))];people=tickets.filter(t=>t.trip_id===legs[0]).length;name=tickets[0].name;
  const metaRow=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='booking_metadata'").bind('booking:'+b.code).first<any>();
  const pack=metaRow?JSON.parse(metaRow.data).package:null;
  description=pack?'باقة النقل والإقامة — '+pack.name:'حجز مقاعد — '+(legs.length>1?'ذهاب وعودة':'ذهاب فقط');
  details.push('عدد المسافرين: '+people);
  for(const [i,tripId] of legs.entries()){
   const leg=tickets.find(t=>t.trip_id===tripId)!;
   const stations=(await db().prepare("SELECT id,data FROM entities WHERE kind='station' AND id IN (?,?)").bind(leg.from_station,leg.to_station).all<any>()).results;
   const station=(id:string)=>{const s=stations.find(s=>s.id===id);return s?JSON.parse(s.data).ar:id};
   details.push((i?'العودة: ':'الذهاب: ')+leg.date+' '+leg.time,station(leg.from_station)+' ← '+station(leg.to_station),'المقاعد: '+tickets.filter(t=>t.trip_id===tripId).map(t=>t.seat).join('، '));
  }
  if(pack)details.push('الفندق: '+pack.hotel,'نوع الغرفة: '+pack.roomType,'الغرف: '+pack.rooms+' — الليالي: '+pack.nights,'الدخول: '+pack.checkIn+' — المغادرة: '+pack.checkOut);
 }
 const invoice={version:1,bookingCode:b.code,issuedAt:now(),seller,customer:{name,mobile:source.mobile,email:source.email||''},description,details,quantity:1,...vatIncluded(total),paymentMethod:'cash'};
 // Sequence allocation and deduplication happen in one SQLite write, not in a read/write pair.
 const guard=isPrivate?"EXISTS(SELECT 1 FROM entities WHERE id=? AND kind='private_booking' AND data=?)":"EXISTS(SELECT 1 FROM bookings WHERE code=? AND amount=? AND status IN ('pending','paid'))";
 await db().prepare("INSERT OR IGNORE INTO entities(id,kind,data) SELECT ?,'invoice',json_set(?,'$.sequence',COALESCE((SELECT MAX(CAST(json_extract(data,'$.sequence') AS INTEGER)) FROM entities WHERE kind='invoice'),0)+1) WHERE "+guard).bind(key,JSON.stringify(invoice),...(isPrivate?[row.id,row.data]:[b.code,total])).run();
 const saved=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='invoice'").bind(key).first<any>();
 if(!saved)fail('CONFLICT',409);
 return{invoice:JSON.parse(saved.data),...state};
}
