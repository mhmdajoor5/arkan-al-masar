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
function loadLocal(file){
 const compiled=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const target={exports:{}};
 vm.runInNewContext(compiled,{exports:target.exports,module:target,require:id=>id==='./arkan-server'?{db:()=>db,fail}:id==='./operations-auth'?{requireStaff:async roles=>{assert.deepEqual(Array.from(roles),['admin','accountant']);if(!authorized)fail('FORBIDDEN',403);return{email:'admin@example.invalid'}}}:id==='./ledger-accounts'?loadLocal('lib/ledger-accounts.ts'):projectRequire(id),crypto:globalThis.crypto,URL,Uint8Array,btoa,Date});
 return target.exports;
}
const api=loadLocal('lib/ledger.ts');
const a={category:'customer',name:'Extra A'},b={category:'supplier',name:'Extra B'};
(async()=>{
 // Contacts: saved on add, normalized, editable, kept through a rename.
 const added=await api.ledgerAction({op:'addLedgerParty',...a,phone:'0501234567',email:'Test@Example.com'});
 assert.equal(added.party.phone,'966501234567');assert.equal(added.party.email,'test@example.com');
 await api.ledgerAction({op:'addLedgerParty',...b});
 await assert.rejects(api.ledgerAction({op:'saveLedgerContact',account:b,phone:'12',email:''}),/LEDGER_CONTACT_PHONE/);
 await assert.rejects(api.ledgerAction({op:'saveLedgerContact',account:b,phone:'',email:'nope'}),/LEDGER_CONTACT_EMAIL/);
 await assert.rejects(api.ledgerAction({op:'saveLedgerContact',account:{category:'supplier',name:'Missing'},phone:'0551112222'}),/LEDGER_ACCOUNT_NOT_FOUND/);
 await api.ledgerAction({op:'saveLedgerContact',account:b,phone:'+966 55 111 2222',email:''});
 await api.ledgerAction({op:'renameLedgerAccount',account:b,name:'Extra B renamed',expectedRevision:0,requestId:crypto.randomUUID()});
 let state=await api.ledgerState();
 const contact=state.accounts.find(x=>x.name===b.name);assert.equal(contact.phone,'966551112222');assert.equal(contact.displayName,'Extra B renamed');
 // Totals: a transfer between two accounts in view is not new debit/credit.
 await api.ledgerAction({op:'saveLedger',data:{...a,party:a.name,entryDate:'2026-10-01',statement:'Sale',description:'إيراد',debit:0,credit:50000}});
 const transfer=await api.ledgerAction({op:'createLedgerTransfer',id:crypto.randomUUID(),data:{from:a,to:b,amount:20000,entryDate:'2026-10-02',statement:'Move'}});
 state=await api.ledgerState();
 assert.deepEqual({debit:state.summary.debit,credit:state.summary.credit,balance:state.summary.balance},{debit:0,credit:50000,balance:50000});
 assert.equal(state.transferPairs.length,1);assert.equal(state.transferPairs[0].amount,20000);
 // One side only in view: the transfer is real movement for that account.
 const single=await api.ledgerState('customer');assert.equal(single.summary.debit,20000);assert.equal(single.summary.credit,50000);
 const party=await api.ledgerState('','',false,a.name);assert.equal(party.summary.debit,20000);
 // Same rule on the accounts page.
 const {accountTotals}=loadLocal('lib/ledger-categories.ts');
 assert.deepEqual({...accountTotals(state.accounts,state.transferPairs)},{debit:0,credit:50000,balance:50000});
 assert.deepEqual({...accountTotals(state.accounts.filter(x=>x.category==='customer'),state.transferPairs)},{debit:20000,credit:50000,balance:30000});
 // A cancelled transfer leaves two pairs (original + reversal); both are internal.
 await api.ledgerAction({op:'cancelLedgerTransfer',id:transfer.id,requestId:crypto.randomUUID(),expectedRevision:0,data:{entryDate:'2026-10-03',reason:'Error'}});
 state=await api.ledgerState();assert.equal(state.transferPairs.length,2);assert.equal(state.summary.debit,0);assert.equal(state.summary.credit,50000);
 assert.deepEqual({...accountTotals(state.accounts,state.transferPairs)},{debit:0,credit:50000,balance:50000});
 // Attachments can be deleted; an audit record stays without the file.
 const entry=state.entries.find(e=>e.statement==='Sale').id,attachment=crypto.randomUUID();
 sql.prepare("INSERT INTO entities(id,kind,data) VALUES(?,'ledger_attachment',?)").run(attachment,JSON.stringify({entry,name:'r.jpg',type:'image/jpeg',file:'data:image/jpeg;base64,AA=='}));
 assert.equal((await api.ledgerState()).entries.find(e=>e.id===entry).attachments.length,1);
 await api.ledgerAction({op:'deleteLedgerAttachment',id:attachment});
 assert.equal((await api.ledgerState()).entries.find(e=>e.id===entry).attachments.length,0);
 const audit=JSON.parse(sql.prepare("SELECT data FROM entities WHERE kind='ledger_attachment_delete'").get().data);assert.equal(audit.entry,entry);assert.equal(audit.file,undefined);
 await assert.rejects(api.ledgerAction({op:'deleteLedgerAttachment',id:attachment}),/NOT_FOUND/);
 console.log('ledger extras: ok');
})().catch(error=>{console.error(error);process.exit(1)});
