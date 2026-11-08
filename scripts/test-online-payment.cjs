// Isolated SQLite test of the MyFatoorah flow. MyFatoorah's API is mocked; no network or credentials are used.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),projectRequire=createRequire(path.join(root,'package.json')),ts=projectRequire('typescript');
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const file of ['0000_yielding_silver_centurion.sql','0001_rainy_santa_claus.sql','0002_sour_scarecrow.sql','0003_trip_seats.sql'])sql.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
let clock=Date.parse('2026-11-08T10:00:00+03:00');
class Clock extends Date{static now(){return clock}}
const database={prepare(text){let args=[];return{bind(...values){args=values;return this},execute(){const s=sql.prepare(text);return s.columns().length?{results:s.all(...args),meta:{changes:0}}:{results:[],meta:s.run(...args)}},async first(){return this.execute().results[0]||null},async all(){return this.execute()},async run(){return this.execute()}}},async batch(commands){sql.exec('BEGIN');try{const result=commands.map(c=>c.execute());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
const env={DB:database};
const staff=async()=>({email:'test-admin@example.invalid',role:'admin',driverId:''});
// Mocked MyFatoorah API.
const calls=[];let invoices=0,gatewayStatus={};
async function fetchMock(url,init){
  const body=JSON.parse(init.body);calls.push({url,body,auth:init.headers.Authorization});
  if(url.endsWith('/v2/SendPayment')){invoices++;const id=String(1000+invoices);gatewayStatus[id]={InvoiceId:Number(id),InvoiceStatus:'Pending',InvoiceValue:body.InvoiceValue,CustomerReference:body.CustomerReference,UserDefinedField:body.UserDefinedField,InvoiceTransactions:[]};return Response.json({IsSuccess:true,Data:{InvoiceId:Number(id),InvoiceURL:'https://demo.myfatoorah.com/invoice/'+id}})}
  if(url.endsWith('/v2/getPaymentStatus'))return Response.json({IsSuccess:true,Data:gatewayStatus[String(body.Key)]});
  return Response.json({IsSuccess:false,Message:'unknown'},{status:404});
}
const cache={};
function load(file){if(cache[file])return cache[file];const target={exports:{}};cache[file]=target.exports;const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports:target.exports,module:target,require:name=>name==='cloudflare:workers'?{env}:name==='./operations-auth'?{requireStaff:staff,staffUser:staff}:name==='./trip-operations'?{issueBookingAccess:async()=>'test-tracking'}:name==='./package-reservations'?{packageSelection:async()=>null,heldPackage:async()=>null}:['./finance','./checkin-trial','./hotels'].includes(name)?{}:name.startsWith('./')?load('lib/'+name.slice(2)+'.ts'):projectRequire(name),Date:Clock,crypto:globalThis.crypto,TextEncoder,URL,Request,Response,fetch:fetchMock,console});return target.exports}
const api=load('lib/arkan-server.ts'),pay=load('lib/myfatoorah.ts'),{paymentPolicy}=load('lib/payment-policy.ts');
const req=new Request('https://arkanalmasar.sa/api/arkan',{headers:{'cf-connecting-ip':'203.0.113.7'}});
const entity=(id,kind,data)=>sql.prepare('INSERT INTO entities VALUES(?,?,?)').run(id,kind,JSON.stringify(data));
for(const city of ['jeddah','makkah'])entity(city,'station',{city,active:true});
entity('daily','schedule',{from:'jeddah',to:'makkah',time:'20:00',bus:'',driver:'',seats:49,start:'2026-11-01',end:'2099-12-31',active:true});
const passenger={name:'Test Passenger',title:'mr',identityType:'passport',nationalId:'A1234567',nationality:'SA'};
async function book(method,seat){const hold=await api.makeHold({legs:[{trip:'daily_2026-11-09',seats:[seat]}]},req);const b=await api.confirm({token:hold.token,passengers:[passenger],mobile:'0512345678',email:'test@example.invalid',accept:true,paymentMethod:method},req);return {hold,b}}
const status=code=>sql.prepare('SELECT status,refund FROM bookings WHERE code=?').get(code);
const meta=code=>JSON.parse(sql.prepare("SELECT data FROM entities WHERE id=?").get('booking:'+code).data);
(async()=>{
 await api.materialize('2026-11-09');
 // Without a token, online payment is off and cash stays available.
 assert.equal(paymentPolicy({paymentMode:'online'},false).cash,true);assert.equal(paymentPolicy({},false).online,false);
 await assert.rejects(book('online',1),/PAYMENT_METHOD_UNAVAILABLE/);
 env.MYFATOORAH_TOKEN='SK_TEST_'+'x'.repeat(40);
 assert.equal(paymentPolicy({},true).online,true);assert.equal(paymentPolicy({paymentMode:'cash'},true).online,false);
 // Online booking: pending, seats booked, invoice created once and reused.
 const {hold,b}=await book('online',2);
 assert.equal(b.status,'pending');assert.equal(b.paymentMethod,'online');
 assert.equal(sql.prepare("SELECT status FROM holds WHERE token=?").get(hold.token).status,'booked');
 await assert.rejects(pay.startPayment({code:b.code,token:'f'.repeat(64)},req),/BOOKING_NOT_FOUND/);
 const started=await pay.startPayment({code:b.code,token:hold.token,lang:'ar'},req);
 assert.match(started.url,/^https:\/\/demo\.myfatoorah\.com\/invoice\//);
 const send=calls.find(c=>c.url.endsWith('/v2/SendPayment'));
 assert.equal(send.url,'https://apitest.myfatoorah.com/v2/SendPayment');assert.equal(send.auth,'Bearer '+env.MYFATOORAH_TOKEN);
 assert.equal(send.body.InvoiceValue,b.amount/100);assert.equal(send.body.CustomerReference,b.code);assert.equal(send.body.CustomerMobile,'512345678');
 assert.equal(send.body.CallBackUrl,'https://arkanalmasar.sa/?payment=return&code='+b.code);
 assert.equal((await pay.startPayment({code:b.code,token:hold.token},req)).url,started.url);assert.equal(invoices,1);
 const invoiceId=meta(b.code).payment.invoiceId;
 // Not paid yet, or a payment that does not match the booking, changes nothing.
 assert.equal((await pay.reconcile(b.code)).status,'pending');
 gatewayStatus[invoiceId]={...gatewayStatus[invoiceId],InvoiceStatus:'Paid',CustomerReference:'AM-000000000000',UserDefinedField:''};
 assert.equal((await pay.reconcile(b.code)).status,'pending');
 gatewayStatus[invoiceId]={...gatewayStatus[invoiceId],CustomerReference:b.code,InvoiceValue:0.5};
 assert.equal((await pay.reconcile(b.code)).status,'pending');
 // A real payment marks the booking paid exactly once.
 gatewayStatus[invoiceId]={...gatewayStatus[invoiceId],InvoiceValue:b.amount/100,InvoiceTransactions:[{TransactionStatus:'Succss',PaymentId:'PAY-1',PaymentGateway:'MADA'}]};
 const verified=await pay.verifyPayment({code:b.code,token:hold.token},req);
 assert.equal(verified.status,'paid');assert.equal(status(b.code).status,'paid');
 await pay.reconcile(b.code);await pay.paymentWebhook(new Request('https://arkanalmasar.sa/api/arkan?op=myfatoorahWebhook',{method:'POST',body:JSON.stringify({Data:{CustomerReference:b.code}})}));
 assert.equal(meta(b.code).paymentEvents.length,1);assert.equal(meta(b.code).paymentEvents[0].paymentId,'PAY-1');
 // Staff cannot flip a gateway-paid booking back to unpaid.
 await assert.rejects(api.adminAction({op:'setPaymentStatus',code:b.code,expectedStatus:'paid',status:'pending'}),/PAYMENT_LOCKED/);
 // Unpaid online bookings release their seats after 30 minutes; a lost callback is still caught by the webhook.
 const late=await book('online',3);await pay.startPayment({code:late.b.code,token:late.hold.token},req);
 const cash=await book('cash',4);
 clock+=31*60*1000;
 assert.equal((await pay.releaseUnpaidOnline(true)).released,1);
 assert.equal(status(late.b.code).status,'cancelled');assert.equal(sql.prepare('SELECT COUNT(*) n FROM holds WHERE token=?').get(late.hold.token).n,0);
 assert.equal(status(cash.b.code).status,'pending');assert.equal(status(b.code).status,'paid');
 await assert.rejects(pay.startPayment({code:late.b.code,token:late.hold.token},req),/PAYMENT_EXPIRED/);
 const lateInvoice=meta(late.b.code).payment.invoiceId;
 gatewayStatus[lateInvoice]={...gatewayStatus[lateInvoice],InvoiceStatus:'Paid',InvoiceTransactions:[{TransactionStatus:'Succss',PaymentId:'PAY-2'}]};
 await pay.paymentWebhook(new Request('https://arkanalmasar.sa/api/arkan?op=myfatoorahWebhook',{method:'POST',body:JSON.stringify({Event:{Name:'PaymentStatusChanged'},Data:{Invoice:{ExternalIdentifier:late.b.code}}})}));
 assert.deepEqual({...status(late.b.code)},{status:'cancelled',refund:'required'});
 // A paid booking found during the sweep is recorded, not cancelled.
 const swept=await book('online',5);await pay.startPayment({code:swept.b.code,token:swept.hold.token},req);
 const sweptInvoice=meta(swept.b.code).payment.invoiceId;
 gatewayStatus[sweptInvoice]={...gatewayStatus[sweptInvoice],InvoiceStatus:'Paid',InvoiceTransactions:[{TransactionStatus:'Succss',PaymentId:'PAY-3'}]};
 clock+=31*60*1000;await pay.releaseUnpaidOnline(true);
 assert.equal(status(swept.b.code).status,'paid');
 // Saving "online only" needs the gateway.
 const base={one:15,round:30,whatsapp:'',contactEmail:'',cancellationAr:'سياسة الإلغاء',cancellationEn:'Cancellation policy'};
 await api.adminAction({op:'saveSettings',data:{...base,paymentMode:'online'}});
 delete env.MYFATOORAH_TOKEN;
 await assert.rejects(api.adminAction({op:'saveSettings',data:{...base,paymentMode:'online'}}),/PAYMENT_GATEWAY_NOT_READY/);
 console.log('PASS online payment: gateway off/on policy, pending online booking, invoice creation and reuse, token check, status verification against MyFatoorah (pending, wrong reference, short amount, paid), idempotent callback/webhook, paid lock, 30-minute release, late payment refund flag, sweep keeps paid bookings, online-only setting guard.');
})().catch(e=>{console.error(e);process.exitCode=1});
