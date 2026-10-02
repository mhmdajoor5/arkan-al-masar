// Real SQLite transactions; no production data or credentials.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),projectRequire=createRequire(path.join(root,'package.json')),ts=projectRequire('typescript');
const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE entities(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL);'+fs.readFileSync(path.join(root,'drizzle/0004_ledger_entries.sql'),'utf8'));
let clock=Date.parse('2026-10-03T00:00:00+03:00'),authorized=true,failAt=-1;
class Clock extends Date{static now(){return clock}}
const database={prepare(text){let args=[];return{bind(...values){args=values;return this},execute(){const s=sql.prepare(text);return s.columns().length?{results:s.all(...args),meta:{changes:0}}:{results:[],meta:s.run(...args)}},async first(){return this.execute().results[0]||null},async all(){return this.execute()},async run(){return this.execute()}}},async batch(commands){sql.exec('BEGIN');try{const result=commands.map((c,i)=>{if(i===failAt){failAt=-1;throw Error('ROLLBACK_FIXTURE')}return c.execute()});sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})},cache={};
function load(file){if(cache[file])return cache[file];const target={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports:target.exports,module:target,require:name=>name==='./arkan-server'?{db:()=>database,fail}:name==='./operations-auth'?{requireStaff:async roles=>{assert.deepEqual(Array.from(roles),['admin']);if(!authorized)fail('FORBIDDEN',403);return{email:'test-admin@example.invalid'}}}:name.startsWith('./')?load('lib/'+name.slice(2)+'.ts'):projectRequire(name),Date:Clock,crypto:globalThis.crypto});return cache[file]=target.exports}
const core=load('lib/monthly-ledger-core.ts'),api=load('lib/monthly-ledger.ts'),accounts=load('lib/ledger-accounts.ts');
const rows=()=>sql.prepare('SELECT * FROM ledger_entries ORDER BY entry_date').all();
const posts=()=>sql.prepare("SELECT * FROM entities WHERE kind='ledger_monthly_post'").all();
const getRule=id=>JSON.parse(sql.prepare('SELECT data FROM entities WHERE id=?').get('ledger_monthly:'+id).data);
const make=(overrides={})=>({id:crypto.randomUUID(),requestId:crypto.randomUUID(),expectedRevision:0,data:{category:'driver',party:'Test driver',title:'Driver salary',kind:'salary',amount:200000,side:'credit',active:true,startMonth:'2026-11',...overrides}});
const edit=(b,overrides)=>({...b,requestId:crypto.randomUUID(),expectedRevision:getRule(b.id).revision,data:{...b.data,...overrides}});
const at=value=>Date.parse(value);
(async()=>{
 await accounts.addLedgerAccount({category:'driver',name:'Test driver'});
 const salary=make();
 authorized=false;await assert.rejects(api.saveMonthlyLedger(salary),/FORBIDDEN/);await assert.rejects(api.monthlyLedgerState(),/FORBIDDEN/);authorized=true;
 await assert.rejects(api.saveMonthlyLedger(make({amount:0})));await assert.rejects(api.saveMonthlyLedger(make({amount:1.5})));await assert.rejects(api.saveMonthlyLedger(make({startMonth:'2026-10'})),/MONTHLY_START_DATE/);
 await api.saveMonthlyLedger(salary);await api.saveMonthlyLedger(salary);
 assert.equal((await api.monthlyLedgerState()).rules.length,1);assert.equal(rows().length,0);
 await core.postMonthlyLedger(database,at('2026-10-31T20:59:59Z'));assert.equal(rows().length,0);
 const due=at('2026-10-31T21:00:00Z');
 failAt=1;await assert.rejects(core.postMonthlyLedger(database,due),/ROLLBACK_FIXTURE/);assert.equal(posts().length,0);assert.equal(rows().length,0);assert.equal(getRule(salary.id).nextMonth,'2026-11');
 await Promise.all([core.postMonthlyLedger(database,due),core.postMonthlyLedger(database,due)]);
 await core.postMonthlyLedger(database,due+3600000);assert.equal(rows().length,1);assert.equal(posts().length,1);assert.equal(rows()[0].entry_date,'2026-11-01');assert.equal(rows()[0].credit,200000);assert.equal(rows()[0].debit,0);assert.equal(rows()[0].actor,'system:monthly-ledger');assert.match(rows()[0].id,/^[a-f0-9-]{36}$/);
 clock=at('2026-11-10T00:00:00+03:00');const change=edit(salary,{amount:250000,startMonth:'2026-12'});await api.saveMonthlyLedger(change);await api.saveMonthlyLedger(change);assert.equal(rows()[0].credit,200000);
 await assert.rejects(api.saveMonthlyLedger({...change,requestId:crypto.randomUUID()}),/MONTHLY_CHANGED/);
 await core.postMonthlyLedger(database,at('2026-12-01T00:00:00+03:00'));assert.equal(rows()[1].credit,250000);
 // Paused months are never caught up when resumed.
 clock=at('2026-12-10T00:00:00+03:00');await api.saveMonthlyLedger(edit(salary,{active:false,startMonth:'2027-01',amount:250000}));
 await core.postMonthlyLedger(database,at('2027-01-01T00:00:00+03:00'));assert.equal(rows().length,2);
 clock=at('2027-01-10T00:00:00+03:00');await api.saveMonthlyLedger(edit(salary,{active:true,startMonth:'2027-02',amount:250000}));
 await core.postMonthlyLedger(database,at('2027-02-01T00:00:00+03:00'));assert.equal(rows().length,3);assert.equal(rows()[2].entry_date,'2027-02-01');
 // Archived account months are explicitly skipped and audited, including catch-up.
 sql.prepare("INSERT INTO entities VALUES(?,'ledger_account',?)").run('account-fixture',JSON.stringify({category:'driver',name:'Test driver',archived:1}));
 await core.postMonthlyLedger(database,at('2027-04-02T00:00:00+03:00'));assert.equal(rows().length,3);assert.equal(posts().length,5);assert.equal(getRule(salary.id).nextMonth,'2027-05');
 assert.equal(posts().map(p=>JSON.parse(p.data)).filter(p=>p.status==='skipped_archived').length,2);
 sql.prepare('DELETE FROM entities WHERE id=?').run('account-fixture');
 await core.postMonthlyLedger(database,at('2027-05-01T00:00:00+03:00'));assert.equal(rows().length,4);
 // Deleted generated entries do not reappear; normal later months still post.
 sql.prepare('DELETE FROM ledger_entries WHERE entry_date=?').run('2027-05-01');await core.postMonthlyLedger(database,at('2027-05-02T00:00:00+03:00'));assert.equal(rows().length,3);
 await core.postMonthlyLedger(database,at('2027-07-02T00:00:00+03:00'));assert.equal(rows().length,5);assert.equal(rows()[3].entry_date,'2027-06-01');assert.equal(rows()[4].entry_date,'2027-07-01');
 // Distinct obligations on the same account and a debit rent rule remain independent.
 clock=at('2027-07-10T00:00:00+03:00');await accounts.addLedgerAccount({category:'rent',name:'Test landlord'});
 const rent=make({category:'rent',party:'Test landlord',title:'Rent',kind:'rent',side:'debit',amount:50000,startMonth:'2027-08'});await api.saveMonthlyLedger(rent);
 await core.postMonthlyLedger(database,at('2027-08-01T00:00:00+03:00'));const r=rows().find(r=>r.category==='rent');assert.equal(r.debit,50000);assert.equal(r.credit,0);assert.equal(r.entry_date,'2027-08-01');
 // Competing edits: exactly one wins, and previous postings are unchanged.
 const oldRows=rows();const results=await Promise.allSettled([api.saveMonthlyLedger(edit(rent,{startMonth:'2027-09',amount:60000})),api.saveMonthlyLedger(edit(rent,{startMonth:'2027-09',amount:70000}))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(rows(),oldRows);
 assert.equal(core.followingMonth('2026-12'),'2027-01');
 console.log('PASS monthly ledger: Saudi midnight, authorization, validation, idempotency, concurrency, rollback, future edits, pause/resume, archived-account skips, catch-up, debit/credit and deleted-entry retry protection.');
})().catch(e=>{console.error(e);process.exitCode=1});
