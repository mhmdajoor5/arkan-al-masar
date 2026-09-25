import type {D1Database} from '@cloudflare/workers-types';
import {TRIAL_BOOKING,TRIAL_TICKET,TRIAL_TRIP,TRIAL_DRIVER,TRIAL_STARTS} from './checkin-trial-config';

const hold='746602aa-f1b4-485c-81be-37671cc52e2f5f639da5-dfa2-45a6-b0d3-a6e5aaa0e126';
const trialMobile='966500000000';

// Bounded data initialization, never a public API for making tickets travel-valid.
// Retaining the booking in any status prevents recreation after cancellation.
export async function seedRequestedCheckinTrial(database:D1Database,at=Date.now()){
  const existing=await database.prepare('SELECT code,mobile FROM bookings WHERE code=?').bind(TRIAL_BOOKING).first<{code:string;mobile:string}>();
  if(existing){
    // Complete this synthetic fixture's retrieval details without changing its boarding or payment state.
    if(!existing.mobile)await database.prepare("UPDATE bookings SET mobile=? WHERE code=? AND mobile='' AND request_hash='requested-checkin-trial-2026-09-25' AND status IN ('test','cancelled')").bind(trialMobile,TRIAL_BOOKING).run();
    return;
  }
  if(at>=TRIAL_STARTS)return;
  await database.batch([
    database.prepare("DELETE FROM holds WHERE trip_id=? AND status='held' AND expires<=?").bind(TRIAL_TRIP,at),
    database.prepare(`INSERT OR IGNORE INTO holds(trip_id,seat,token,expires,status)
      WITH RECURSIVE seats(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seats WHERE n<49)
      SELECT t.id,seats.n,?,t.starts,'booked' FROM trips t CROSS JOIN seats
      WHERE t.id=? AND t.driver=? AND t.date='2026-09-25' AND t.time='07:30'
        AND t.from_station='jeddah' AND t.to_station='makkah' AND t.bus='bus-1'
        AND t.starts=? AND t.starts>? AND t.status='active'
        AND COALESCE((SELECT phase FROM trip_progress WHERE trip_id=t.id),'scheduled') IN ('scheduled','boarding')
        AND NOT EXISTS(SELECT 1 FROM bookings WHERE code=?)
        AND NOT EXISTS(SELECT 1 FROM holds h WHERE h.trip_id=t.id AND h.seat=seats.n)
      ORDER BY seats.n LIMIT 1`).bind(hold,TRIAL_TRIP,TRIAL_DRIVER,TRIAL_STARTS,at,TRIAL_BOOKING),
    database.prepare(`INSERT OR IGNORE INTO bookings(code,hold_token,request_hash,mobile,email,amount,status,created,refund)
      SELECT ?,token,'requested-checkin-trial-2026-09-25',?,'',0,'test',?,'none'
      FROM holds WHERE token=? AND trip_id=? AND status='booked' LIMIT 1`).bind(TRIAL_BOOKING,trialMobile,at,hold,TRIAL_TRIP),
    database.prepare(`INSERT OR IGNORE INTO tickets(id,booking_code,trip_id,seat,name,national_id,nationality)
      SELECT ?,b.code,h.trip_id,h.seat,'راكب اختبار','','' FROM holds h JOIN bookings b ON b.hold_token=h.token
      WHERE b.code=? AND b.status='test' AND h.token=? AND h.trip_id=? LIMIT 1`).bind(TRIAL_TICKET,TRIAL_BOOKING,hold,TRIAL_TRIP),
  ]);
}
