// Exercise production booking SQL against isolated SQLite, never live customer data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),projectRequire=createRequire(path.join(root,'package.json')),ts=projectRequire('typescript');
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const file of ['0000_yielding_silver_centurion.sql','0001_rainy_santa_claus.sql','0002_sour_scarecrow.sql','0003_trip_seats.sql'])sql.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
let clock=Date.parse('2026-10-03T00:00:00+03:00'),authorized=true,failAt=-1,packageSnapshot=null,beforeBatch=null;
class Clock extends Date{static now(){return clock}}
const database={prepare(text){let args=[];return{bind(...values){args=values;return this},execute(){const s=sql.prepare(text);return s.columns().length?{results:s.all(...args),meta:{changes:0}}:{results:[],meta:s.run(...args)}},async first(){return this.execute().results[0]||null},async all(){return this.execute()},async run(){return this.execute()}}},async batch(commands){if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook()}sql.exec('BEGIN');try{const result=commands.map((c,i)=>{if(i===failAt){failAt=-1;throw Error('ROLLBACK_FIXTURE')}return c.execute()});sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})},cache={};
const staff=async()=>{if(!authorized)fail('FORBIDDEN',403);return{email:'test-admin@example.invalid',role:'admin',driverId:''}};
function load(file){if(cache[file])return cache[file];const target={exports:{}};cache[file]=target.exports;const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports:target.exports,module:target,require:name=>name==='cloudflare:workers'?{env:{DB:database}}:name==='./operations-auth'?{requireStaff:staff,staffUser:staff}:name==='./trip-operations'?{issueBookingAccess:async()=> 'test-tracking'}:name==='./package-reservations'?{packageSelection:async()=>null,heldPackage:async()=>packageSnapshot}:['./finance','./checkin-trial','./hotels'].includes(name)?{}:name.startsWith('./')?load('lib/'+name.slice(2)+'.ts'):projectRequire(name),Date:Clock,crypto:globalThis.crypto,TextEncoder,URL,Request});return target.exports}
const api=load('lib/arkan-server.ts');
const entity=(id,kind,data)=>sql.prepare('INSERT INTO entities VALUES(?,?,?)').run(id,kind,JSON.stringify(data));
for(const city of ['jeddah','makkah'])entity(city,'station',{city,active:true});
const schedule={from:'jeddah',to:'makkah',time:'08:00',bus:'',driver:'',seats:49,start:'2026-10-01',end:'2026-10-30',active:true};
const save=data=>api.adminAction({op:'saveEntity',kind:'schedule',id:'daily',data});
const trip=date=>sql.prepare('SELECT * FROM trips WHERE id=?').get('daily_'+date);
(async()=>{
entity('daily','schedule',schedule);
await api.materialize('2026-10-04');await api.materialize('2026-10-05');await api.materialize('2026-10-06');
await api.adminAction({op:'cancelTrip',id:'daily_2026-10-06'});
const revised={...schedule,time:'10:00',from:'makkah',to:'jeddah',seats:24};
await save(revised);
assert.equal(trip('2026-10-04').time,'10:00');assert.equal(trip('2026-10-05').from_station,'makkah');assert.equal(trip('2026-10-04').seats,24);
assert.equal(trip('2026-10-06').status,'cancelled');assert.equal(trip('2026-10-06').time,'08:00');
await api.materialize('2026-10-04');await api.materialize('2026-10-07');assert.equal(trip('2026-10-04').time,'10:00');assert.equal(trip('2026-10-07').time,'10:00');
// Even a reservation arriving after the reads must roll back the entire save.
beforeBatch=()=>sql.prepare("INSERT INTO holds VALUES(?,1,'hold',?,'held')").run('daily_2026-10-05',clock+600000);
await assert.rejects(save({...revised,time:'12:00'}),/SCHEDULE_UPDATE_BLOCKED/);
assert.equal(trip('2026-10-04').time,'10:00');assert.equal(JSON.parse(sql.prepare("SELECT data FROM entities WHERE id='daily'").get().data).time,'10:00');
sql.exec('DELETE FROM holds');
// A resource conflict that appears after validation also rolls back all rows.
entity('bus','bus',{seats:49,active:true});
beforeBatch=()=>sql.prepare('INSERT INTO trips VALUES(?,?,?,?,?,?,?,?,?,?)').run('manual','2026-10-05','12:00',Date.parse('2026-10-05T12:00:00+03:00'),'jeddah','makkah','bus','','active',49);
await assert.rejects(save({...revised,time:'12:00',bus:'bus'}),/SCHEDULE_UPDATE_BLOCKED/);assert.equal(trip('2026-10-04').time,'10:00');
await save({...revised,end:'2026-10-04'});assert.equal(trip('2026-10-05').status,'cancelled');assert.equal(trip('2026-10-07').status,'cancelled');
clock=Date.parse('2026-10-05T00:00:00+03:00');await save({...revised,time:'14:00'});assert.equal(trip('2026-10-04').time,'10:00');
assert.equal(sql.prepare("SELECT count(*) n FROM entities WHERE kind='schedule_change'").get().n,0);
console.log('PASS schedule sync: generated and new trips, time/route/capacity, cancellations, history, shortened ranges, reservation race and assignment race with atomic rollback.');
})().catch(e=>{console.error(e);process.exitCode=1});
