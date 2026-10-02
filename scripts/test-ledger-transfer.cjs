// Isolated SQLite test: no Cloudflare credentials or production records are used.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),projectRequire=createRequire(path.join(root,'package.json'));
const ts=projectRequire('typescript'),sql=new DatabaseSync(':memory:');
sql.exec("CREATE TABLE entities(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL);"+fs.readFileSync(path.join(root,'drizzle/0004_ledger_entries.sql'),'utf8'));
let authorized=true,failStatement=-1;
const db={
 prepare(text){let args=[];return{bind(...values){args=values;return this},execute(){const stmt=sql.prepare(text);if(stmt.columns().length)return{results:stmt.all(...args),meta:{changes:0}};return{results:[],meta:stmt.run(...args)}},async first(){return this.execute().results[0]||null},async all(){return this.execute()},async run(){return this.execute()}}},
 async batch(statements){sql.exec('BEGIN');try{const results=statements.map((statement,index)=>{if(index===failStatement){failStatement=-1;throw new Error('SIMULATED_DATABASE_FAILURE')}return statement.execute()});sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}}
};
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const compiled=ts.transpileModule(fs.readFileSync(path.join(root,'lib/ledger.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleObject={exports:{}};
vm.runInNewContext(compiled,{exports:moduleObject.exports,module:moduleObject,require:id=>id==='./arkan-server'?{db:()=>db,fail}:id==='./operations-auth'?{requireStaff:async roles=>{assert.deepEqual(Array.from(roles),['admin']);if(!authorized)fail('FORBIDDEN',403);return{email:'admin@example.invalid'}}}:projectRequire(id),crypto:globalThis.crypto,URL,Uint8Array,btoa,Date});
const api=moduleObject.exports;
const from={category:'customer',name:'Test A'},to={category:'driver',name:'Test B'},third={category:'supplier',name:'Test C'};
const original={from,to,amount:100000,entryDate:'2026-10-03',statement:'Test transfer'};
const rows=()=>sql.prepare('SELECT * FROM ledger_entries ORDER BY id').all();
const balance=account=>sql.prepare('SELECT COALESCE(SUM(credit-debit),0) n FROM ledger_entries WHERE category=? AND party=?').get(account.category,account.name).n;
const metadata=id=>JSON.parse(sql.prepare("SELECT data FROM entities WHERE id=?").get('ledger_transfer:'+id).data);
const eventCount=()=>sql.prepare("SELECT COUNT(*) n FROM entities WHERE kind='ledger_transfer_change'").get().n;
const edit=(id,revision,data)=>({op:'updateLedgerTransfer',id,requestId:crypto.randomUUID(),expectedRevision:revision,data});
const cancel=(id,revision)=>({op:'cancelLedgerTransfer',id,requestId:crypto.randomUUID(),expectedRevision:revision,data:{entryDate:'2026-10-05',reason:'Entered in error'}});
const clear=()=>sql.exec('DELETE FROM entities; DELETE FROM ledger_entries;');
async function create(){for(const account of[from,to,third])await api.ledgerAction({op:'addLedgerParty',...account});return api.ledgerAction({op:'createLedgerTransfer',id:crypto.randomUUID(),data:original})}

(async()=>{
 let transfer=await create();
 const initialRows=rows(),attachment=crypto.randomUUID();
 sql.prepare("INSERT INTO entities VALUES(?,'ledger_attachment',?)").run(attachment,JSON.stringify({entry:transfer.fromEntryId,name:'receipt.jpg',image:'data:image/jpeg;base64,/9j/2Q=='}));
 const update=edit(transfer.id,0,{...original,to:third,amount:150000,entryDate:'2026-10-04',statement:'Corrected transfer'});
 await api.ledgerAction(update);await api.ledgerAction(update);
 assert.equal(rows().length,2);assert.equal(balance(from),-150000);assert.equal(balance(to),0);assert.equal(balance(third),150000);assert.equal(eventCount(),1);
 assert.equal(metadata(transfer.id).revision,1);
 for(const row of rows()){assert.equal(row.entry_date,'2026-10-04');assert.equal(row.statement,'Corrected transfer')}
 assert.ok((await api.ledgerAttachment(attachment)).image);
 const state=await api.ledgerState();assert.equal(state.entries.length,2);assert.ok(state.entries.every(e=>e.transfer.revision===1&&e.attachments.length===1));
 await assert.rejects(api.ledgerAction(edit(transfer.id,0,original)),/LEDGER_TRANSFER_CHANGED/);
 await assert.rejects(api.ledgerAction({...update,data:original}),/LEDGER_TRANSFER_CHANGED/);
 await assert.rejects(api.ledgerAction(edit(transfer.id,1,{...original,to:from})),/LEDGER_SAME_ACCOUNT/);
 await assert.rejects(api.ledgerAction(edit(transfer.id,1,{...original,to:{category:'customer',name:'Missing'}})),/LEDGER_TRANSFER_CHANGED/);
 await assert.rejects(api.ledgerAction({...cancel(transfer.id,1),data:{entryDate:'2026-10-03',reason:'Earlier date'}}),/INVALID_INPUT/);
 await assert.rejects(api.ledgerAction({op:'deleteLedger',id:transfer.fromEntryId}),/LEDGER_TRANSFER_LOCKED/);
 const correctedRows=rows(),cancellation=cancel(transfer.id,1);
 await api.ledgerAction(cancellation);await api.ledgerAction(cancellation);
 assert.equal(rows().length,4);assert.equal(balance(from),0);assert.equal(balance(to),0);assert.equal(balance(third),0);assert.equal(eventCount(),2);
 assert.deepEqual(rows().filter(r=>[transfer.fromEntryId,transfer.toEntryId].includes(r.id)),correctedRows);
 assert.equal(metadata(transfer.id).status,'cancelled');assert.ok((await api.ledgerAttachment(attachment)).image);
 const cancelledState=await api.ledgerState();assert.ok(cancelledState.entries.every(e=>e.transfer.status==='cancelled'&&e.attachments.length===1));
 assert.equal(cancelledState.entries.filter(e=>e.transferReversal).length,2);
 for(const row of rows())await assert.rejects(api.ledgerAction({op:'deleteLedger',id:row.id}),/LEDGER_TRANSFER_LOCKED/);
 await assert.rejects(api.ledgerAction(edit(transfer.id,2,original)),/LEDGER_TRANSFER_CANCELLED/);
 await assert.rejects(api.ledgerAction(cancel(transfer.id,2)),/LEDGER_TRANSFER_CANCELLED/);
 assert.equal(eventCount(),2);
 const audit=JSON.parse(sql.prepare("SELECT data FROM entities WHERE kind='ledger_transfer_change' AND json_extract(data,'$.action')='edit'").get().data);
 assert.equal(audit.before.amount,100000);assert.equal(audit.after.amount,150000);assert.equal(audit.actor,'admin@example.invalid');

 clear();transfer=await create();
 const beforeFailure=rows(),beforeMetadata=metadata(transfer.id);failStatement=2;
 await assert.rejects(api.ledgerAction(edit(transfer.id,0,{...original,amount:777})),/SIMULATED_DATABASE_FAILURE/);
 assert.deepEqual(rows(),beforeFailure);assert.deepEqual(metadata(transfer.id),beforeMetadata);assert.equal(eventCount(),0);
 failStatement=3;await assert.rejects(api.ledgerAction(cancel(transfer.id,0)),/SIMULATED_DATABASE_FAILURE/);
 assert.deepEqual(rows(),beforeFailure);assert.deepEqual(metadata(transfer.id),beforeMetadata);assert.equal(eventCount(),0);

 const attempts=await Promise.allSettled([api.ledgerAction(edit(transfer.id,0,{...original,amount:200000})),api.ledgerAction(cancel(transfer.id,0))]);
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal(eventCount(),1);
 assert.equal(balance(from)+balance(to),0);
 clear();transfer=await create();const sameCancel=cancel(transfer.id,0);
 await Promise.all([api.ledgerAction(sameCancel),api.ledgerAction(sameCancel)]);
 assert.equal(rows().length,4);assert.equal(eventCount(),1);assert.equal(balance(from),0);assert.equal(balance(to),0);
 authorized=false;
 await assert.rejects(api.ledgerAction(edit(transfer.id,1,original)),/FORBIDDEN/);
 await assert.rejects(api.ledgerAction(cancel(transfer.id,1)),/FORBIDDEN/);
 await assert.rejects(api.ledgerState(),/FORBIDDEN/);
 console.log('PASS: legacy transfers; paired edits and balances; receipt retention; cancellation reversals; audit records; stale updates; idempotent retries; concurrent edits/cancellation; transaction rollback; linked-entry locks; admin access.');
})().catch(error=>{console.error(error);process.exitCode=1});
