import {z} from 'zod';
import {db,now,today,fail,tripList} from './arkan-server';
import {packageSchema,packageVisible,packageTotal,type TravelPackage} from './travel-packages';
// Each departure has a dedicated room allotment; never count expired holds or cancelled bookings.
const occupied=`e.kind='package_hold' AND json_extract(e.data,'$.packageId')=? AND json_extract(e.data,'$.departureId')=? AND (EXISTS(SELECT 1 FROM bookings b WHERE b.hold_token=json_extract(e.data,'$.token') AND b.status<>'cancelled') OR (json_extract(e.data,'$.expires')>? AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.hold_token=json_extract(e.data,'$.token'))))`;
export async function packageStock(packageId:string,departureId:string){const row=await db().prepare(`SELECT COALESCE(sum(json_extract(e.data,'$.rooms')),0) used FROM entities e WHERE ${occupied}`).bind(packageId,departureId,now()).first<any>();return Number(row?.used||0)}
export async function packageOffer(id:string,departureId:string){
 const row=await db().prepare("SELECT data FROM entities WHERE kind='package' AND id=?").bind(id).first<any>();if(!row)fail('PACKAGE_UNAVAILABLE',409);
 const parsed=packageSchema.safeParse(JSON.parse(row.data));if(!parsed.success)fail('PACKAGE_UNAVAILABLE',409);const p={...parsed.data,id};
 const d=p.departures.find(d=>d.id===departureId);if(!p.hotel||!p.roomType||!packageVisible(p,today())||!d||d.date<today())fail('PACKAGE_UNAVAILABLE',409);
 const lists=await Promise.all([tripList(d.date),tripList(d.returnDate)]);const trips=[lists[0].find(t=>t.id===d.outbound),lists[1].find(t=>t.id===d.inbound)];
 if(trips.some(t=>!t||t.status!=='active'||!t.bus_active||!['scheduled','boarding'].includes(t.phase)||t.starts<=now()))fail('TRIP_UNAVAILABLE',409);
 if(trips[0].from_station!==trips[1].to_station||trips[0].to_station!==trips[1].from_station||Math.round((Date.parse(d.returnDate)-Date.parse(d.date))/86400000)!==p.nights)fail('PACKAGE_UNAVAILABLE',409);
 return{package:p,departure:d,trips,availableRooms:Math.max(0,d.rooms-await packageStock(id,d.id)),raw:row.data};
}
export async function packageSelection(body:any,legs:any[],people:number,token:string,expires:number){
 if(body===undefined)return null;
 const b=z.object({id:z.string().max(180),departureId:z.string().max(100),rooms:z.number().int().min(1).max(49)}).parse(body);
 const offer=await packageOffer(b.id,b.departureId),p=offer.package,d=offer.departure;
 if(legs.length!==2||legs[0].trip!==d.outbound||legs[1].trip!==d.inbound||people>b.rooms*p.roomCapacity||b.rooms>people||b.rooms>offer.availableRooms)fail('PACKAGE_UNAVAILABLE',409);
 const snapshot={packageId:p.id,departureId:d.id,name:p.ar,nameEn:p.en,hotel:p.hotel,roomType:p.roomType,nights:p.nights,roomCapacity:p.roomCapacity,rooms:b.rooms,people,checkIn:d.date,checkOut:d.returnDate,personPrice:p.price,roomPrice:p.roomPrice,amount:packageTotal(p,people,b.rooms),terms:p.termsAr,token,expires};
 // The NOT NULL kind is an assertion: failure rolls back the whole seat+room batch.
 const statement=db().prepare(`INSERT INTO entities(id,kind,data) VALUES(?,(SELECT 'package_hold' WHERE EXISTS(SELECT 1 FROM entities WHERE id=? AND kind='package' AND data=?) AND (SELECT COALESCE(sum(json_extract(e.data,'$.rooms')),0) FROM entities e WHERE ${occupied})+?<=?),?)`).bind('package-hold:'+token,p.id,offer.raw,p.id,d.id,now(),b.rooms,d.rooms,JSON.stringify(snapshot));
 return{snapshot,statement};
}
export async function heldPackage(token:string){const row=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='package_hold'").bind('package-hold:'+token).first<any>();if(!row)return null;const {token:_,expires:__,...snapshot}=JSON.parse(row.data);return snapshot}
export async function saveTravelPackage(id:string,data:unknown){
 const d=packageSchema.parse(data);for(const slot of d.departures){const lists=await Promise.all([tripList(slot.date),tripList(slot.returnDate)]);const out=lists[0].find(t=>t.id===slot.outbound),back=lists[1].find(t=>t.id===slot.inbound);if(!out||!back||out.from_station!==back.to_station||out.to_station!==back.from_station||Date.parse(slot.returnDate)-Date.parse(slot.date)!==d.nights*86400000)fail('PACKAGE_DATES',409)}
 const old=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='package'").bind(id).first<any>();
 const structural=(v:any)=>JSON.stringify([v.hotel,v.roomType,v.roomCapacity,v.nights,v.departures]);const changed=!!old&&structural(JSON.parse(old.data))!==structural(d);
 const result=await db().prepare(`INSERT INTO entities(id,kind,data) VALUES(?,'package',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE entities.kind='package' AND entities.data=? AND (?=0 OR NOT EXISTS(SELECT 1 FROM entities e WHERE e.kind='package_hold' AND json_extract(e.data,'$.packageId')=? AND (EXISTS(SELECT 1 FROM bookings b WHERE b.hold_token=json_extract(e.data,'$.token') AND b.status<>'cancelled' AND json_extract(e.data,'$.checkOut')>=?) OR (json_extract(e.data,'$.expires')>? AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.hold_token=json_extract(e.data,'$.token'))))))`).bind(id,JSON.stringify(d),old?.data||'',changed?1:0,id,today(),now()).run();if(!result.meta.changes)fail('PACKAGE_IN_USE',409);return{ok:true,id};
}
