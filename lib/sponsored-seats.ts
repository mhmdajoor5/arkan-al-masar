import {z} from 'zod';
import {db,fail,now} from './arkan-server';
import {requireStaff} from './operations-auth';

// Allocation is an admin-confirmed, already funded seat allowance, not a payment gateway.
const usedSQL="SELECT COALESCE(SUM(json_extract(leg.value,'$.count')),0) used FROM entities e JOIN json_each(e.data,'$.legs') leg JOIN bookings b ON b.code=json_extract(e.data,'$.code') WHERE e.kind='sponsored_booking' AND b.status<>'cancelled' AND json_extract(leg.value,'$.trip')=?";
export async function sponsoredTrip(trip:string){
 const [row,used]=await Promise.all([
  db().prepare("SELECT data FROM entities WHERE id=? AND kind='sponsored_allocation'").bind('sponsored:'+trip).first<{data:string}>(),
  db().prepare(usedSQL).bind(trip).first<{used:number}>()
 ]);
 const data=row?JSON.parse(row.data):{seats:0,revision:0};
 return{trip,seats:data.seats,used:Number(used?.used||0),available:Math.max(0,data.seats-Number(used?.used||0)),revision:data.revision,raw:row?.data||''};
}
export async function sponsoredOffer(legs:{trip:string}[],hasPackage=false){
 if(hasPackage)return{available:0};
 const items=await Promise.all(legs.map(l=>sponsoredTrip(l.trip)));
 return{available:items.length?Math.min(...items.map(v=>v.available)):0};
}
export async function sponsoredAdminState(trip:string){
 await requireStaff(['admin']);
 const data=await sponsoredTrip(z.string().min(1).max(180).parse(trip));
 const {raw,...visible}=data;return visible;
}
export async function saveSponsoredAllocation(body:any){
 const actor=await requireStaff(['admin']);
 const b=z.object({trip:z.string().min(1).max(180),seats:z.number().int().min(0).max(300),expectedRevision:z.number().int().nonnegative(),requestId:z.string().uuid(),funded:z.literal(true)}).parse(body);
 const event='sponsored_change:'+b.requestId,request=JSON.stringify(b);
 const replay=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='sponsored_change'").bind(event).first<{data:string}>();
 if(replay){if(JSON.parse(replay.data).request!==request)fail('SPONSORED_CHANGED',409);return{ok:true}}
 const before=await sponsoredTrip(b.trip);
 if(before.revision!==b.expectedRevision||b.seats<before.used)fail('SPONSORED_CHANGED',409);
 const value=JSON.stringify({trip:b.trip,seats:b.seats,revision:before.revision+1,updated:now(),actor:actor.email,requestId:b.requestId});
 const result=await db().batch([
  db().prepare("INSERT INTO entities(id,kind,data) SELECT ?,'sponsored_allocation',? WHERE COALESCE((SELECT data FROM entities WHERE id=?),'')=? AND EXISTS(SELECT 1 FROM trips t WHERE t.id=? AND t.status='active' AND t.starts>? AND COALESCE(t.seats,(SELECT json_extract(data,'$.seats') FROM entities WHERE id=t.bus AND kind='bus'),49)>=?) AND ("+usedSQL+")<=? AND NOT EXISTS(SELECT 1 FROM entities WHERE id=?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind('sponsored:'+b.trip,value,'sponsored:'+b.trip,before.raw,b.trip,now(),b.seats,b.trip,b.seats,event),
  db().prepare("INSERT INTO entities(id,kind,data) SELECT ?,'sponsored_change',? WHERE EXISTS(SELECT 1 FROM entities WHERE id=? AND data=?) ON CONFLICT(id) DO NOTHING").bind(event,JSON.stringify({request,before:{seats:before.seats,revision:before.revision},after:JSON.parse(value),actor:actor.email,at:now()}),'sponsored:'+b.trip,value),
  db().prepare('SELECT data FROM entities WHERE id=?').bind(event)
 ]);
 const saved=result[2].results[0] as {data:string}|undefined;
 if(!saved||JSON.parse(saved.data).request!==request)fail('SPONSORED_CHANGED',409);
 return{ok:true};
}
export async function sponsoredClaim(code:string,legs:{trip:string;seats:number[]}[],coveredAmount:number,hasPackage:boolean){
 if(hasPackage)fail('SPONSORED_UNAVAILABLE',409);
 const allocations=await Promise.all(legs.map(l=>sponsoredTrip(l.trip)));
 if(allocations.some((a,i)=>a.available<legs[i].seats.length))fail('SPONSORED_UNAVAILABLE',409);
 const args:any[]=[];
 const conditions=allocations.map((a,i)=>{args.push('sponsored:'+a.trip,a.raw,a.trip,legs[i].seats.length,a.seats);return "EXISTS(SELECT 1 FROM entities WHERE id=? AND kind='sponsored_allocation' AND data=?) AND ("+usedSQL+")+?<=?"});
 // A failed NOT NULL assertion rolls back booking, claim, tickets and seats together.
 return db().prepare("INSERT INTO entities(id,kind,data) VALUES(?,(SELECT 'sponsored_booking' WHERE "+conditions.join(' AND ')+"),?)").bind('sponsored-booking:'+code,...args,JSON.stringify({code,legs:legs.map(l=>({trip:l.trip,count:l.seats.length})),coveredAmount,created:now()}));
}
