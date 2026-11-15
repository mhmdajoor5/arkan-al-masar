'use client';
import {useState} from 'react';
import {CalendarClock} from 'lucide-react';
import {toast} from 'sonner';
import {api,errorMessage,useLocale} from '@/lib/arkan-client';

type Ticket={id:string;trip_id:string;date:string;time:string;from_station:string;to_station:string;boarded?:number|null;name:string;seat:number};
type Booking={code:string;status:string;paymentMethod?:string|null;package?:unknown;tickets:Ticket[]};
type Trip={id:string;date:string;time:string;available:number;bus_name?:string};

const messages:Record<string,[string,string]>={
 SEAT_TAKEN:['لا توجد مقاعد كافية في الرحلة المختارة. اختر رحلة أخرى.','Not enough seats on that trip. Choose another trip.'],
 TRIP_UNAVAILABLE:['الرحلة المختارة لم تعد متاحة. حدّث القائمة.','That trip is no longer available. Refresh the list.'],
 BOOKING_BOARDED:['صعد أحد الركاب بالفعل، لا يمكن تغيير الرحلة.','A passenger has already boarded; the trip cannot change.'],
 BOOKING_CANCELLED:['الحجز ملغي.','The booking is cancelled.'],
 BOOKING_MOVE_UNSUPPORTED:['حجوزات الضيافة والباقات مرتبطة برحلتها ولا يمكن نقلها.','Sponsored and package bookings are tied to their trip and cannot be moved.'],
 INVALID_RETURN:['يجب أن تكون رحلة العودة بعد رحلة الذهاب بساعة ونصف على الأقل.','The return trip must be at least 90 minutes after the outbound trip.'],
 MOVE_ROUTE_MISMATCH:['اختر رحلة على نفس المسار.','Choose a trip on the same route.']
};

// Lets admins move one leg of a booking to another date or departure time on the same route.
export default function BookingMove({booking,route,onMoved}:{booking:Booking;route:(from:string,to:string)=>string;onMoved:()=>Promise<void>}){
 const {en,t}=useLocale();
 const [open,setOpen]=useState(''),[date,setDate]=useState(''),[trips,setTrips]=useState<Trip[]|null>(null),[choice,setChoice]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(booking.status==='cancelled'||booking.paymentMethod==='sponsored'||booking.package)return null;
 const legs=Array.from(new Map(booking.tickets.map(ticket=>[ticket.trip_id,ticket])).values());
 const today=new Date(Date.now()+10800000).toISOString().slice(0,10);
 const fail=(e:any)=>setError(messages[e?.message]?.[en?1:0]||errorMessage(e,en));
 async function search(leg:Ticket,value:string){
  setDate(value);setChoice('');setTrips(null);setError('');if(!value)return;
  setBusy(true);
  try{const result=await api('trips&date='+encodeURIComponent(value)+'&from='+encodeURIComponent(leg.from_station)+'&to='+encodeURIComponent(leg.to_station));setTrips((result.trips||[]).filter((trip:Trip)=>trip.id!==leg.trip_id))}
  catch(e){fail(e)}finally{setBusy(false)}
 }
 async function move(leg:Ticket,passengers:number){
  const trip=trips?.find(item=>item.id===choice);if(!trip)return;
  if(!confirm(t(`نقل ${passengers} راكب إلى رحلة ${trip.date} الساعة ${trip.time}؟`,`Move ${passengers} passenger(s) to the ${trip.date} ${trip.time} trip?`)))return;
  setBusy(true);setError('');
  try{await api('moveBooking',{code:booking.code,fromTrip:leg.trip_id,toTrip:trip.id});toast.success(t('تم تعديل تاريخ ووقت الحجز','Booking date and time updated'));setOpen('');setTrips(null);setDate('');setChoice('');await onMoved()}
  catch(e){fail(e)}finally{setBusy(false)}
 }
 return <div className="booking-move">{legs.map(leg=>{
  const passengers=booking.tickets.filter(ticket=>ticket.trip_id===leg.trip_id),boarded=passengers.some(ticket=>ticket.boarded);
  return <section key={leg.trip_id}>
   <div className="booking-move-head"><span><b>{route(leg.from_station,leg.to_station)}</b><small dir="ltr">{leg.date} · {leg.time}</small></span>{boarded?<small>{t('صعد الركاب؛ لا يمكن التعديل','Passengers boarded; cannot change')}</small>:<button type="button" className="secondary" disabled={busy} aria-expanded={open===leg.trip_id} onClick={()=>{setOpen(open===leg.trip_id?'':leg.trip_id);setTrips(null);setDate('');setChoice('');setError('')}}><CalendarClock size={17}/>{t('تعديل التاريخ والوقت','Change date & time')}</button>}</div>
   {open===leg.trip_id&&<div className="booking-move-form">
    <label>{t('التاريخ الجديد','New date')}<input type="date" min={today} value={date} disabled={busy} onChange={e=>void search(leg,e.target.value)}/></label>
    {trips&&(trips.length?<label>{t('الرحلة (الوقت)','Trip (time)')}<select value={choice} disabled={busy} onChange={e=>setChoice(e.target.value)}><option value="">{t('اختر الوقت','Choose a time')}</option>{trips.map(trip=><option key={trip.id} value={trip.id} disabled={trip.available<passengers.length}>{trip.time} — {trip.available} {t('مقعد متاح','seats left')}{trip.bus_name?' · '+trip.bus_name:''}</option>)}</select></label>:<p className="ops-form-note">{t('لا توجد رحلات متاحة على هذا المسار في هذا التاريخ.','No available trips on this route for that date.')}</p>)}
    <p className="ops-form-note">{t('يُنقل جميع ركاب هذه الرحلة في الحجز، ويبقى رمز التذكرة نفسه. يُحافظ على رقم المقعد إن كان متاحًا.','All passengers on this leg move together and keep their ticket codes. Seat numbers are kept when free.')}</p>
    <div className="ledger-actions"><button type="button" className="primary" disabled={busy||!choice} onClick={()=>void move(leg,passengers.length)}>{busy?t('جارٍ الحفظ…','Saving…'):t('حفظ التعديل','Save change')}</button><button type="button" className="secondary" disabled={busy} onClick={()=>setOpen('')}>{t('إلغاء','Cancel')}</button></div>
   </div>}
  </section>})}
  {error&&<p role="alert" className="ops-error">{error}</p>}
 </div>;
}
