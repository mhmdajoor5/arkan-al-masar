// Isolated SQLite test for moving a booking leg to another date/time.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),projectRequire=createRequire(path.join(root,'package.json'));
const ts=projectRequire('typescript'),sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8').replace(/--> statement-breakpoint/g,''));
const db={
 prepare(text){let args=[];return{bind(...values){args=values;return this},execute(){const stmt=sql.prepare(text);if(stmt.columns().length)return{results:stmt.all(...args),meta:{changes:0}};return{results:[],meta:stmt.run(...args)}},async first(){return this.execute().results[0]||null},async all(){return this.execute()},async run(){return this.execute()}}},
 async batch(statements){sql.exec('BEGIN');try{const results=statements.map(statement=>statement.execute());sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}}
};
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const compiled=ts.transpileModule(fs.readFileSync(path.join(root,'lib/booking-move.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const target={exports:{}};let role='admin';
vm.runInNewContext(compiled,{exports:target.exports,module:target,require:id=>id==='./arkan-server'?{db:()=>db,fail,now:()=>Date.now()}:id==='./operations-auth'?{requireStaff:async roles=>{if(!roles.includes(role))fail('FORBIDDEN',403);return{email:'admin@example.invalid'}}}:projectRequire(id),Date,JSON});
const {moveBooking}=target.exports;
const day=86400000,base=Date.now()+2*day;
const trip=(id,offset,from='A',to='B',seats=4)=>sql.prepare("INSERT INTO trips(id,date,time,starts,from_station,to_station,bus,seats) VALUES(?,?,?,?,?,?,'',?)").run(id,new Date(base+offset).toISOString().slice(0,10),new Date(base+offset).toISOString().slice(11,16),base+offset,from,to,seats);
trip('t1',0);trip('t2',day);trip('t3',day+3600000);trip('back',2*day,'B','A');trip('other',day,'A','C');
sql.prepare("INSERT INTO bookings(code,hold_token,request_hash,mobile,email,amount,status,created) VALUES('BK1','tok','h','966500000000','a@b.c',100,'paid',0)").run();
for(const [id,tripId,seat] of [['k1','t1',1],['k2','t1',2],['k3','back',1]]){sql.prepare("INSERT INTO tickets(id,booking_code,trip_id,seat,name,national_id,nationality) VALUES(?,'BK1',?,?,'N','1234567890','SA')").run(id,tripId,seat);sql.prepare("INSERT INTO holds(trip_id,seat,token,expires,status) VALUES(?,?,'tok',0,'booked')").run(tripId,seat)}
// Another booking already holds seat 1 on t2.
sql.prepare("INSERT INTO holds(trip_id,seat,token,expires,status) VALUES('t2',1,'x',0,'booked')").run();
const seatsOf=(tripId)=>sql.prepare("SELECT seat FROM tickets WHERE booking_code='BK1' AND trip_id=? ORDER BY seat").all(tripId).map(r=>r.seat);
(async()=>{
 role='checkin';await assert.rejects(moveBooking({code:'BK1',fromTrip:'t1',toTrip:'t2'}),/FORBIDDEN/);role='admin';
 await assert.rejects(moveBooking({code:'BK1',fromTrip:'t1',toTrip:'other'}),/MOVE_ROUTE_MISMATCH/);
 await assert.rejects(moveBooking({code:'BK1',fromTrip:'t1',toTrip:'t1'}),/MOVE_SAME_TRIP/);
 // Return trip must stay 90 minutes after outbound.
 trip('late',2*day-30*60000);await assert.rejects(moveBooking({code:'BK1',fromTrip:'t1',toTrip:'late'}),/INVALID_RETURN/);
 const result=await moveBooking({code:'bk1',fromTrip:'t1',toTrip:'t2'});
 assert.equal(result.trip,'t2');
 assert.deepEqual(seatsOf('t1'),[]);assert.deepEqual(seatsOf('t2'),[2,3]); // seat 2 kept, seat 1 taken → next free
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM holds WHERE trip_id='t1'").get().n,0);
 assert.deepEqual(sql.prepare("SELECT seat,status FROM holds WHERE trip_id='t2' AND token='tok' ORDER BY seat").all().map(r=>[r.seat,r.status]),[[2,'booked'],[3,'booked']]);
 const meta=JSON.parse(sql.prepare("SELECT data FROM entities WHERE id='booking:BK1'").get().data);assert.equal(meta.moves.length,1);assert.equal(meta.moves[0].from.trip,'t1');
 // Not enough seats.
 sql.prepare("INSERT INTO holds(trip_id,seat,token,expires,status) VALUES('t3',1,'y',0,'booked'),('t3',2,'y',0,'booked'),('t3',3,'y',0,'booked')").run();
 await assert.rejects(moveBooking({code:'BK1',fromTrip:'t2',toTrip:'t3'}),/SEAT_TAKEN/);
 assert.deepEqual(seatsOf('t2'),[2,3]);
 // Boarded passengers block the move.
 sql.prepare("UPDATE tickets SET boarded=1 WHERE id='k3'").run();
 trip('back2',3*day,'B','A');await assert.rejects(moveBooking({code:'BK1',fromTrip:'back',toTrip:'back2'}),/BOOKING_BOARDED/);
 // Sponsored bookings stay on their trip.
 sql.prepare("INSERT INTO entities(id,kind,data) VALUES('booking:BK1','booking_metadata','{\"paymentMethod\":\"sponsored\"}') ON CONFLICT(id) DO UPDATE SET data=excluded.data").run();
 await assert.rejects(moveBooking({code:'BK1',fromTrip:'t2',toTrip:'t1'}),/BOOKING_MOVE_UNSUPPORTED/);
 console.log('booking move: ok');
})().catch(error=>{console.error(error);process.exit(1)});
