import { env } from 'cloudflare:workers';
import {buildPushPayload} from '@block65/webcrypto-web-push';
import {db,fail} from './arkan-server';
import {requireStaff,digest} from './operations-auth';
import {bookingAccess} from './trip-operations';
import {z} from 'zod';
const b64=(bytes:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function vapidSubject(){
 const subject=String((env as any).VAPID_SUBJECT||'');
 if(subject.length<=500&&/^mailto:[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(subject))return subject;
 try{const url=new URL(subject);if(subject.length<=500&&url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash)return subject}catch{}
 fail('PUSH_NOT_CONFIGURED',503);
}
async function vapid(){const subject=vapidSubject();let row=await db().prepare("SELECT data FROM push_keys WHERE id='vapid'").first<any>();if(!row){const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const [pub,priv]=await Promise.all([crypto.subtle.exportKey('raw',key.publicKey),crypto.subtle.exportKey('jwk',key.privateKey)]);const data={publicKey:b64(pub),privateKey:priv.d,subject};await db().prepare("INSERT OR IGNORE INTO push_keys(id,data) VALUES('vapid',?)").bind(JSON.stringify(data)).run();row=await db().prepare("SELECT data FROM push_keys WHERE id='vapid'").first<any>()}return {...JSON.parse(row.data),subject}}
export async function pushConfig(){return{publicKey:(await vapid()).publicKey}}
function validEndpoint(value:string){try{const u=new URL(value),h=u.hostname;return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&(h==='fcm.googleapis.com'||h==='web.push.apple.com'||h.endsWith('.push.apple.com')||h==='updates.push.services.mozilla.com'||h.endsWith('.push.services.mozilla.com')||h.endsWith('.notify.windows.com'))}catch{return false}}
const subscriptionSchema=z.object({endpoint:z.string().max(2000).refine(validEndpoint),expirationTime:z.number().nullable().optional(),keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}={0,2}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/)})});
export async function subscribePush(body:any){const audience=z.enum(['staff','booking']).parse(body.audience);const subject=audience==='staff'?(await requireStaff(['admin','checkin'])).id:await bookingAccess(body.token);const subscription=subscriptionSchema.parse(body.subscription),locale=body.locale==='en'?'en':'ar';const endpointId=await digest(subscription.endpoint),id=await digest(audience+':'+subject+':'+endpointId);if(body.remove){await db().prepare('DELETE FROM push_subscriptions WHERE id=? AND audience=? AND subject=?').bind(id,audience,subject).run();return{ok:true}}try{const keyBytes=Uint8Array.from(atob(subscription.keys.p256dh.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));await crypto.subtle.importKey('raw',keyBytes,{name:'ECDH',namedCurve:'P-256'},false,[])}catch{fail('INVALID_INPUT')}
const saved=await db().prepare('INSERT INTO push_subscriptions(id,audience,subject,subscription,locale,created) SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM push_subscriptions WHERE audience=? AND subject=?)<5 OR EXISTS(SELECT 1 FROM push_subscriptions WHERE id=?) ON CONFLICT(id) DO UPDATE SET subscription=excluded.subscription,locale=excluded.locale').bind(id,audience,subject,JSON.stringify(subscription),locale,Date.now(),audience,subject,id).run();if(!saved.meta.changes)fail('PUSH_DEVICE_LIMIT',409);return{ok:true}}
export async function queueEventPush(event:string){await db().prepare("INSERT OR IGNORE INTO push_outbox(event_id,subscription_id,state,attempts,updated,error) SELECT e.id,s.id,'queued',0,?,'' FROM trip_events e CROSS JOIN push_subscriptions s WHERE (e.id=? OR (?='' AND e.created>?)) AND s.created<=e.created AND ((s.audience='staff' AND EXISTS(SELECT 1 FROM accounts a WHERE a.id=s.subject AND a.active=1 AND a.role IN ('admin','checkin'))) OR (s.audience='booking' AND EXISTS(SELECT 1 FROM tickets k JOIN bookings b ON b.code=k.booking_code WHERE k.trip_id=e.trip_id AND b.code=s.subject AND b.status<>'cancelled'))) ").bind(Date.now(),event,event,Date.now()-6*60*60000).run()}
export async function deliverPush(){
 const deadline=Date.now()+26000;let passes=0;const keys=await vapid();
 while(Date.now()<deadline-5000&&passes++<30){
  const at=Date.now();
  const rows=(await db().prepare("SELECT o.event_id,o.subscription_id,s.subscription,s.locale,s.audience,s.subject,e.phase,e.trip_id,e.created,t.time FROM push_outbox o JOIN push_subscriptions s ON s.id=o.subscription_id JOIN trip_events e ON e.id=o.event_id JOIN trips t ON t.id=e.trip_id WHERE ((o.state IN ('queued','failed') AND o.updated<=?) OR (o.state='sending' AND o.updated<?)) AND o.attempts<3 AND e.created>? AND ((s.audience='staff' AND EXISTS(SELECT 1 FROM accounts a WHERE a.id=s.subject AND a.active=1 AND a.role IN ('admin','checkin'))) OR (s.audience='booking' AND EXISTS(SELECT 1 FROM bookings b WHERE b.code=s.subject AND b.status<>'cancelled'))) ORDER BY e.created LIMIT 25").bind(at,at-60000,at-6*60*60000).all<any>()).results;
  if(!rows.length){const retry=await db().prepare("SELECT min(updated) due FROM push_outbox WHERE state='failed' AND attempts<3 AND updated>? AND updated<?").bind(at,deadline-5000).first<any>();if(retry?.due){await new Promise(resolve=>setTimeout(resolve,Math.max(1,Math.min(2000,retry.due-at))));continue}break}
  await Promise.allSettled(rows.map(async row=>{
   const claimed=await db().prepare("UPDATE push_outbox SET state='sending',attempts=attempts+1,updated=? WHERE event_id=? AND subscription_id=? AND attempts<3 AND ((state IN ('queued','failed') AND updated<=?) OR (state='sending' AND updated<?)) RETURNING attempts").bind(Date.now(),row.event_id,row.subscription_id,Date.now(),Date.now()-60000).first<any>();if(!claimed)return;
   try{
    const en=row.locale==='en',title=row.phase==='boarding'?(en?'Boarding has opened':'بدأ استقبال الركاب'):row.phase==='in_transit'?(en?'The trip has departed':'انطلقت الرحلة'):(en?'The trip has arrived':'وصلت الرحلة');
    const subscription=JSON.parse(row.subscription);if(!validEndpoint(subscription.endpoint))throw new Error('INVALID_ENDPOINT');
    const payload=await buildPushPayload({data:{title,body:(en?'Arkan Al-Masar · Trip ':'أركان المسار · رحلة ')+row.time,tag:row.event_id,url:row.audience==='staff'?'/admin':'/my-bookings',eventId:row.event_id},options:{ttl:21600,urgency:'high'}},subscription,keys);
    const res=await fetch(subscription.endpoint,{...payload,redirect:'error',signal:AbortSignal.timeout(5000)});
    if(res.status===404||res.status===410){await db().prepare('DELETE FROM push_subscriptions WHERE id=?').bind(row.subscription_id).run();await db().prepare("UPDATE push_outbox SET state='expired',error=?,updated=? WHERE event_id=? AND subscription_id=?").bind(String(res.status),Date.now(),row.event_id,row.subscription_id).run();return}
    if(!res.ok)throw new Error('HTTP_'+res.status);
    await db().prepare("UPDATE push_outbox SET state='accepted',error='',updated=? WHERE event_id=? AND subscription_id=?").bind(Date.now(),row.event_id,row.subscription_id).run();
   }catch(e:any){await db().prepare("UPDATE push_outbox SET state='failed',error=?,updated=? WHERE event_id=? AND subscription_id=?").bind(String(e.message).slice(0,80),Date.now()+2000,row.event_id,row.subscription_id).run()}
  }));
 }
}
export async function retryPush(){await requireStaff(['admin']);await db().prepare("UPDATE push_outbox SET state='queued',attempts=0,updated=? WHERE state IN ('failed','queued') AND event_id IN (SELECT id FROM trip_events WHERE created>?)").bind(Date.now(),Date.now()-6*60*60000).run();return{ok:true}}
export async function pushReport(){await requireStaff(['admin']);return(await db().prepare("SELECT state,count(*) count FROM push_outbox WHERE updated>? GROUP BY state").bind(Date.now()-86400000).all()).results}
