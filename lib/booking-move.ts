import {z} from 'zod';
import {db,fail,now} from './arkan-server';
import {requireStaff} from './operations-auth';

// Moves one leg of a booking (all its passengers) to another departure on the
// same route: a different date and/or time. Ticket ids (the QR codes) stay the
// same; seats keep their numbers when free on the new trip.
const tripSQL="SELECT t.*,COALESCE(t.seats,(SELECT json_extract(data,'$.seats') FROM entities WHERE id=t.bus AND kind='bus'),49) capacity FROM trips t WHERE t.id=?";
const openTrip=" AND t.status='active' AND t.starts>? AND (t.bus='' OR EXISTS(SELECT 1 FROM entities WHERE id=t.bus AND kind='bus' AND COALESCE(json_extract(data,'$.active'),1)=1)) AND NOT EXISTS(SELECT 1 FROM trip_progress p WHERE p.trip_id=t.id AND p.phase IN ('in_transit','arrived'))";

export async function moveBooking(body:any){
 const user=await requireStaff(['admin']);
 const b=z.object({code:z.string().trim().min(3).max(40),fromTrip:z.string().min(1).max(200),toTrip:z.string().min(1).max(200)}).parse(body);
 const code=b.code.toUpperCase();
 if(b.fromTrip===b.toTrip)fail('MOVE_SAME_TRIP');
 const booking=await db().prepare('SELECT code,hold_token,status FROM bookings WHERE code=?').bind(code).first<any>();
 if(!booking)fail('BOOKING_NOT_FOUND',404);
 if(booking.status==='cancelled')fail('BOOKING_CANCELLED',409);
 const metaKey='booking:'+code,metaRow=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='booking_metadata'").bind(metaKey).first<{data:string}>();
 const metadata=metaRow?JSON.parse(metaRow.data):{passengers:{},paymentEvents:[]};
 // Donor-sponsored seats and hotel packages are tied to their original departure.
 if(metadata.paymentMethod==='sponsored'||metadata.package)fail('BOOKING_MOVE_UNSUPPORTED',409);
 const tickets=(await db().prepare('SELECT k.id,k.seat,k.boarded,k.trip_id,t.starts FROM tickets k JOIN trips t ON t.id=k.trip_id WHERE k.booking_code=? ORDER BY k.seat').bind(code).all<any>()).results;
 const leg=tickets.filter(x=>x.trip_id===b.fromTrip);
 if(!leg.length)fail('BOOKING_NOT_FOUND',404);
 if(leg.some(x=>x.boarded))fail('BOOKING_BOARDED',409);
 const source=await db().prepare(tripSQL).bind(b.fromTrip).first<any>();
 const target=await db().prepare(tripSQL+openTrip).bind(b.toTrip,now()).first<any>();
 if(!source||!target)fail('TRIP_UNAVAILABLE',409);
 if(target.from_station!==source.from_station||target.to_station!==source.to_station)fail('MOVE_ROUTE_MISMATCH');
 // Keep at least 90 minutes between the outbound and return legs.
 const other=tickets.find(x=>x.trip_id!==b.fromTrip);
 if(other&&(other.starts>source.starts?target.starts>other.starts-90*60000:target.starts<other.starts+90*60000))fail('INVALID_RETURN');
 const taken=new Set((await db().prepare("SELECT seat FROM holds WHERE trip_id=? AND (status='booked' OR expires>?)").bind(b.toTrip,now()).all<{seat:number}>()).results.map(r=>Number(r.seat)));
 const capacity=Number(target.capacity)||49,free:number[]=[];
 for(let seat=1;seat<=capacity;seat++)if(!taken.has(seat))free.push(seat);
 if(free.length<leg.length)fail('SEAT_TAKEN',409);
 const used=new Set<number>(),seats=new Map<string,number>();
 for(const ticket of leg)if(free.includes(ticket.seat)&&!used.has(ticket.seat)){seats.set(ticket.id,ticket.seat);used.add(ticket.seat)}
 for(const ticket of leg)if(!seats.has(ticket.id)){const seat=free.find(n=>!used.has(n))!;seats.set(ticket.id,seat);used.add(seat)}
 const moved={at:now(),by:user.email,from:{trip:source.id,date:source.date,time:source.time},to:{trip:target.id,date:target.date,time:target.time},seats:leg.map(x=>({ticket:x.id,from:x.seat,to:seats.get(x.id)}))};
 const statements=[db().prepare("DELETE FROM holds WHERE trip_id=? AND status='held' AND expires<=?").bind(b.toTrip,now())];
 for(const ticket of leg){
  const seat=seats.get(ticket.id)!;
  // A seat taken in the meantime makes this insert fail and rolls the whole move back.
  statements.push(
   db().prepare("INSERT INTO holds(trip_id,seat,token,expires,status) SELECT ?,?,?,COALESCE((SELECT expires FROM holds WHERE trip_id=? AND seat=? AND token=?),?),COALESCE((SELECT status FROM holds WHERE trip_id=? AND seat=? AND token=?),'booked') WHERE EXISTS(SELECT 1 FROM tickets WHERE id=? AND trip_id=? AND boarded IS NULL)").bind(b.toTrip,seat,booking.hold_token,b.fromTrip,ticket.seat,booking.hold_token,now(),b.fromTrip,ticket.seat,booking.hold_token,ticket.id,b.fromTrip),
   db().prepare('UPDATE tickets SET trip_id=?,seat=? WHERE id=? AND trip_id=? AND boarded IS NULL').bind(b.toTrip,seat,ticket.id,b.fromTrip),
   db().prepare('DELETE FROM holds WHERE trip_id=? AND seat=? AND token=? AND EXISTS(SELECT 1 FROM tickets WHERE id=? AND trip_id=?)').bind(b.fromTrip,ticket.seat,booking.hold_token,ticket.id,b.toTrip)
  );
 }
 statements.push(db().prepare("INSERT INTO entities(id,kind,data) VALUES(?,'booking_metadata',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(metaKey,JSON.stringify({...metadata,moves:[...(metadata.moves||[]),moved]})));
 try{await db().batch(statements)}catch{fail('SEAT_TAKEN',409)}
 return{ok:true,trip:target.id,date:target.date,time:target.time,seats:moved.seats};
}
