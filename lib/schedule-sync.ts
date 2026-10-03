import {db,fail,now} from './arkan-server';
import {slotPrefix,resourceFree,slotJSON} from './resource-availability';

// Generated IDs are stable: never delete/recreate trips or revive cancellations.
export async function saveSchedule(key:string,data:any){
  const database=db(),at=now();
  const previous=await database.prepare("SELECT data FROM entities WHERE id=? AND kind='schedule'").bind(key).first<{data:string}>();
  if(!previous)fail('NOT_FOUND',404);
  const target="id=?||'_'||date AND status='active' AND starts>?";
  const trips=(await database.prepare('SELECT * FROM trips WHERE '+target).bind(key,at).all<any>()).results;
  const marker='schedule-change:'+crypto.randomUUID();
  const statements=[database.prepare("INSERT INTO entities(id,kind,data) VALUES(?,'schedule_change',CASE WHEN EXISTS(SELECT 1 FROM entities WHERE id=? AND kind='schedule' AND data=?) AND (SELECT count(*) FROM trips WHERE "+target+")=? THEN '{}' ELSE NULL END)").bind(marker,key,previous.data,key,at,trips.length)];
  const check=(condition:string,args:any[])=>database.prepare('UPDATE entities SET data=CASE WHEN '+condition+" THEN '{}' ELSE NULL END WHERE id=?").bind(...args,marker);
  for(const trip of trips){
    const active=data.active&&trip.date>=data.start&&trip.date<=data.end;
    const starts=Date.parse(trip.date+'T'+data.time+':00+03:00');
    // Check the snapshot and reservations inside the same atomic D1 batch.
    const fields=['date','time','starts','from_station','to_station','bus','driver','status','seats'];
    statements.push(check('EXISTS(SELECT 1 FROM trips WHERE id=? AND '+fields.map(f=>f+' IS ?').join(' AND ')+") AND NOT EXISTS(SELECT 1 FROM holds WHERE trip_id=? AND (status='booked' OR expires>?)) AND NOT EXISTS(SELECT 1 FROM tickets k JOIN bookings b ON b.code=k.booking_code WHERE k.trip_id=? AND b.status<>'cancelled') AND NOT EXISTS(SELECT 1 FROM trip_progress WHERE trip_id=? AND phase IN ('boarding','in_transit','arrived'))",[trip.id,...fields.map(f=>trip[f]),trip.id,at,trip.id,trip.id]));
    if(active){
      if(starts<=at)fail('INVALID_ROUTE');
      statements.push(database.prepare(slotPrefix+'UPDATE entities SET data=CASE WHEN '+resourceFree+" THEN '{}' ELSE NULL END WHERE id=?").bind(slotJSON(trip.id,data.bus,data.driver,starts,starts+5400000),marker));
      statements.push(database.prepare('UPDATE trips SET time=?,starts=?,from_station=?,to_station=?,bus=?,driver=?,seats=? WHERE id=?').bind(data.time,starts,data.from,data.to,data.bus,data.driver,data.seats,trip.id));
    }else{
      statements.push(database.prepare("UPDATE trips SET status='cancelled' WHERE id=?").bind(trip.id));
    }
  }
  statements.push(database.prepare("UPDATE entities SET data=? WHERE id=? AND kind='schedule'").bind(JSON.stringify(data),key));
  statements.push(database.prepare('DELETE FROM entities WHERE id=?').bind(marker));
  try{await database.batch(statements)}catch(error){
    // A failed assertion rolls back both the schedule and every dated trip.
    if(String(error).includes('NOT NULL constraint failed: entities.data'))fail('SCHEDULE_UPDATE_BLOCKED',409);
    throw error;
  }
  return{ok:true,id:key};
}
