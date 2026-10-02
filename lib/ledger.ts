import {z} from 'zod';
import {db,fail} from './arkan-server';
import {requireStaff} from './operations-auth';
import {accountSources,accountDirectory,accountAvailable,addLedgerAccount,changeLedgerAccount} from './ledger-accounts';

const category=z.enum(['supplier','customer','driver','purchase','management','debt','rent']);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v);

const transferAccount=z.object({category,name:z.string().min(1).max(140).refine(v=>v.trim().length>0)});
const transferData=z.object({from:transferAccount,to:transferAccount,amount:z.number().int().positive().max(100000000000),entryDate:date,statement:z.string().trim().min(1).max(180)});
const transferDescription=(data:z.infer<typeof transferData>)=>'تحويل من '+data.from.name+' إلى '+data.to.name;
const transferLinked="EXISTS(SELECT 1 FROM entities t WHERE t.kind='ledger_transfer' AND ledger_entries.id IN (json_extract(t.data,'$.fromEntryId'),json_extract(t.data,'$.toEntryId'),json_extract(t.data,'$.reversalFromEntryId'),json_extract(t.data,'$.reversalToEntryId')))";
const accountExists="EXISTS(SELECT 1 FROM ("+accountSources+") WHERE category=? AND name=?) AND "+accountAvailable;

async function ensureLedgerEditable(id:string){
 if(await db().prepare('SELECT 1 FROM ledger_entries WHERE id=? AND '+transferLinked).bind(id).first())fail('LEDGER_TRANSFER_LOCKED',409);
}

async function createLedgerTransfer(body:any,actor:string){
 const id=z.string().uuid().parse(body.id).toLowerCase(),data=transferData.parse(body.data);
 if(data.from.category===data.to.category&&data.from.name===data.to.name)fail('LEDGER_SAME_ACCOUNT');
 const key='ledger_transfer:'+id,nonce=crypto.randomUUID(),created=Date.now(),fromEntryId=crypto.randomUUID(),toEntryId=crypto.randomUUID();
 const request=JSON.stringify(data),metadata=JSON.stringify({id,request,nonce,fromEntryId,toEntryId,created,actor});
 const accountArgs=(value:z.infer<typeof transferAccount>)=>[value.category,value.name,value.category,value.name];
 // The metadata nonce claims this request inside the same transaction as both legs.
 // A concurrent/retried request cannot insert a leg unless it won that claim.
 const results=await db().batch([
  db().prepare("INSERT INTO entities(id,kind,data) SELECT ?,'ledger_transfer',? WHERE "+accountExists+' AND '+accountExists+' ON CONFLICT(id) DO NOTHING').bind(key,metadata,...accountArgs(data.from),...accountArgs(data.to)),
  db().prepare("INSERT INTO ledger_entries(id,category,party,entry_date,statement,description,debit,credit,created,actor) SELECT ?,?,?,?,?,?,?,?,?,? FROM entities WHERE id=? AND kind='ledger_transfer' AND json_extract(data,'$.nonce')=?").bind(fromEntryId,data.from.category,data.from.name,data.entryDate,data.statement,transferDescription(data),data.amount,0,created,actor,key,nonce),
  db().prepare("INSERT INTO ledger_entries(id,category,party,entry_date,statement,description,debit,credit,created,actor) SELECT ?,?,?,?,?,?,?,?,?,? FROM entities WHERE id=? AND kind='ledger_transfer' AND json_extract(data,'$.nonce')=?").bind(toEntryId,data.to.category,data.to.name,data.entryDate,data.statement,transferDescription(data),0,data.amount,created,actor,key,nonce),
  db().prepare("SELECT data FROM entities WHERE id=? AND kind='ledger_transfer'").bind(key)
 ]);
 const row=results[3].results[0] as {data:string}|undefined;
 if(!row)fail('LEDGER_ACCOUNT_NOT_FOUND',404);
 const saved=JSON.parse(row.data);
 if(saved.request!==request)fail('LEDGER_TRANSFER_CHANGED',409);
 return{ok:true,id,fromEntryId:saved.fromEntryId,toEntryId:saved.toEntryId};
}

async function changeLedgerTransfer(body:any,actor:string){
 const id=z.string().uuid().parse(body.id).toLowerCase();
 const requestId=z.string().uuid().parse(body.requestId).toLowerCase();
 const expected=z.number().int().nonnegative().parse(body.expectedRevision);
 const cancelling=body.op==='cancelLedgerTransfer';
 const data=cancelling?null:transferData.parse(body.data);
 const cancellation=cancelling?z.object({entryDate:date,reason:z.string().trim().min(1).max(140)}).parse(body.data):null;
 if(data&&data.from.category===data.to.category&&data.from.name===data.to.name)fail('LEDGER_SAME_ACCOUNT');
 const key='ledger_transfer:'+id,eventKey='ledger_transfer_change:'+requestId;
 const request=JSON.stringify({id,op:body.op,expected,data:data||cancellation});
 const previous=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='ledger_transfer_change'").bind(eventKey).first<{data:string}>();
 if(previous){const event=JSON.parse(previous.data);if(event.request!==request)fail('LEDGER_TRANSFER_CHANGED',409);return event.result}
 const row=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='ledger_transfer'").bind(key).first<{data:string}>();
 if(!row)fail('LEDGER_TRANSFER_NOT_FOUND',404);
 const saved=JSON.parse(row!.data),before=transferData.parse(JSON.parse(saved.request));
 if(saved.status==='cancelled')fail('LEDGER_TRANSFER_CANCELLED',409);
 if((saved.revision||0)!==expected)fail('LEDGER_TRANSFER_CHANGED',409);
 if(cancellation&&cancellation.entryDate<before.entryDate)fail('INVALID_INPUT');
 const revision=expected+1,nonce=crypto.randomUUID(),changed=Date.now();
 const reversalFromEntryId=cancelling?crypto.randomUUID():undefined,reversalToEntryId=cancelling?crypto.randomUUID():undefined;
 const next={...saved,revision,lastMutation:nonce,updated:changed,updatedBy:actor,
  ...(cancellation?{status:'cancelled',cancelledAt:changed,cancelledBy:actor,cancelReason:cancellation.reason,cancelDate:cancellation.entryDate,reversalFromEntryId,reversalToEntryId}:{request:JSON.stringify(data)})};
 const result={ok:true,id,revision,fromEntryId:saved.fromEntryId,toEntryId:saved.toEntryId,status:cancelling?'cancelled':'active'};
 const event=JSON.stringify({request,transferId:id,action:cancelling?'cancel':'edit',before,after:data,reason:cancellation?.reason,entryDate:cancellation?.entryDate,created:changed,actor,result});
 const entryMatches='EXISTS(SELECT 1 FROM ledger_entries WHERE id=? AND category=? AND party=? AND entry_date=? AND statement=? AND debit=? AND credit=?)';
 const legArgs=(entryId:string,account:z.infer<typeof transferAccount>,debit:number,credit:number)=>[entryId,account.category,account.name,before.entryDate,before.statement,debit,credit];
 const accountArgs=(account:z.infer<typeof transferAccount>)=>[account.category,account.name,account.category,account.name];
 const claim="EXISTS(SELECT 1 FROM entities WHERE id=? AND kind='ledger_transfer' AND json_extract(data,'$.lastMutation')=?)";
 // Compare-and-swap the complete metadata and verify both existing legs. D1 batch
 // commits the claim, both leg changes and audit record together, or rolls back all.
 const commands=[db().prepare("UPDATE entities SET data=? WHERE id=? AND kind='ledger_transfer' AND data=? AND "+entryMatches+' AND '+entryMatches+(data?' AND '+accountExists+' AND '+accountExists:'')+" AND NOT EXISTS(SELECT 1 FROM entities WHERE id=?)").bind(JSON.stringify(next),key,row!.data,
  ...legArgs(saved.fromEntryId,before.from,before.amount,0),...legArgs(saved.toEntryId,before.to,0,before.amount),...(data?[...accountArgs(data.from),...accountArgs(data.to)]:[]),eventKey)];
 if(data){
  for(const [entryId,account,debit,credit] of [[saved.fromEntryId,data.from,data.amount,0],[saved.toEntryId,data.to,0,data.amount]] as const){
   commands.push(db().prepare('UPDATE ledger_entries SET category=?,party=?,entry_date=?,statement=?,description=?,debit=?,credit=? WHERE id=? AND '+claim).bind(account.category,account.name,data.entryDate,data.statement,transferDescription(data),debit,credit,entryId,key,nonce));
  }
 }else{
  for(const [entryId,account,debit,credit] of [[reversalFromEntryId!,before.from,0,before.amount],[reversalToEntryId!,before.to,before.amount,0]] as const){
   commands.push(db().prepare('INSERT INTO ledger_entries(id,category,party,entry_date,statement,description,debit,credit,created,actor) SELECT ?,?,?,?,?,?,?,?,?,? WHERE '+claim).bind(entryId,account.category,account.name,cancellation!.entryDate,'إلغاء تحويل: '+cancellation!.reason,'عكس '+transferDescription(before),debit,credit,changed,actor,key,nonce));
  }
 }
 commands.push(db().prepare("INSERT INTO entities(id,kind,data) SELECT ?,'ledger_transfer_change',? WHERE "+claim).bind(eventKey,event,key,nonce));
 commands.push(db().prepare("SELECT data FROM entities WHERE id=? AND kind='ledger_transfer_change'").bind(eventKey));
 const results=await db().batch(commands),completed=results[results.length-1].results[0] as {data:string}|undefined;
 if(!completed)fail('LEDGER_TRANSFER_CHANGED',409);
 const recorded=JSON.parse(completed.data);
 if(recorded.request!==request)fail('LEDGER_TRANSFER_CHANGED',409);
 return recorded.result;
}

export async function ledgerState(categoryValue='',query='',exportAll=false,partyValue='',fromValue='',toValue=''){
 await requireStaff(['admin']);const selected=categoryValue?category.parse(categoryValue):'',term=query.trim().slice(0,120);let sql='SELECT id,category,party,entry_date entryDate,statement,description,debit,credit,created,actor FROM ledger_entries WHERE 1=1';const args:unknown[]=[];
 const from=fromValue?date.parse(fromValue):'',to=toValue?date.parse(toValue):'';
 if(from&&to&&from>to)fail('LEDGER_DATE_RANGE');
 if(from){sql+=' AND entry_date>=?';args.push(from)}
 if(to){sql+=' AND entry_date<=?';args.push(to)}
 if(partyValue){sql+=' AND party=?';args.push(z.string().max(140).parse(partyValue))}
 if(selected){sql+=' AND category=?';args.push(selected)}if(term){sql+=" AND (party LIKE ? OR statement LIKE ? OR description LIKE ? OR EXISTS(SELECT 1 FROM entities p WHERE p.kind='ledger_account' AND json_extract(p.data,'$.category')=ledger_entries.category AND json_extract(p.data,'$.name')=ledger_entries.party AND json_extract(p.data,'$.displayName') LIKE ?))";const value='%'+term+'%';args.push(value,value,value,value)}
 const where=sql.slice(sql.indexOf(' WHERE'));
 const [summary,rows]=await db().batch([
  db().prepare('SELECT COUNT(*) count,COALESCE(SUM(debit),0) debit,COALESCE(SUM(credit),0) credit,COALESCE(SUM(credit-debit),0) balance FROM ledger_entries'+where).bind(...args),
  db().prepare('SELECT id,category,party,entry_date entryDate,statement,description,debit,credit,created,actor,SUM(credit-debit) OVER (ORDER BY entry_date,created,id ROWS UNBOUNDED PRECEDING) running FROM ledger_entries'+where+' ORDER BY entry_date DESC,created DESC,id DESC LIMIT '+(exportAll?10001:500)).bind(...args)
 ]);
 if(exportAll&&Number((summary.results[0] as any)?.count)>10000)fail('LEDGER_EXPORT_LIMIT',400);
 const options=await db().prepare("SELECT data FROM entities WHERE kind='ledger_description' ORDER BY id").all();
 const partyRows=await db().prepare(accountDirectory+' ORDER BY category,displayName').all();
 const labels=new Map(partyRows.results.map((p:any)=>[JSON.stringify([p.category,p.name]),p.displayName]));
 const displayName=(a:{category:string;name:string})=>String(labels.get(JSON.stringify([a.category,a.name]))||a.name);
 const attachments=await db().prepare("SELECT id,json_extract(data,'$.entry') entry,json_extract(data,'$.name') name,COALESCE(json_extract(data,'$.type'),'image/jpeg') type FROM entities WHERE kind='ledger_attachment'").all();
 const balances=await db().prepare('SELECT category,party name,COUNT(*) count,SUM(debit) debit,SUM(credit) credit,SUM(credit-debit) balance FROM ledger_entries GROUP BY category,party').all();
 const transfers=await db().prepare("SELECT data FROM entities WHERE kind='ledger_transfer'").all<{data:string}>();
 const links=new Map<string,any>();
 for(const row of transfers.results){
  const value=JSON.parse(row.data),request=JSON.parse(value.request);
  const transfer={id:value.id,revision:value.revision||0,status:value.status||'active',...request,from:{...request.from,displayName:displayName(request.from)},to:{...request.to,displayName:displayName(request.to)},cancelReason:value.cancelReason,cancelDate:value.cancelDate};
  for(const [entryId,peer,reversal] of [[value.fromEntryId,request.to,false],[value.toEntryId,request.from,false],[value.reversalFromEntryId,request.to,true],[value.reversalToEntryId,request.from,true]]){
   if(entryId)links.set(entryId,{description:(reversal?'عكس ':'')+'تحويل من '+displayName(request.from)+' إلى '+displayName(request.to),transferId:value.id,transferPeer:{...peer,displayName:displayName(peer)},transfer,transferReversal:reversal,attachmentEntries:[value.fromEntryId,value.toEntryId,value.reversalFromEntryId,value.reversalToEntryId].filter(Boolean)});
  }
 }
 return {accounts:partyRows.results.map((p:any)=>({...p,count:0,debit:0,credit:0,balance:0,...balances.results.find((b:any)=>b.category===p.category&&b.name===p.name)})),parties:partyRows.results.filter((p:any)=>!p.archived),entries:rows.results.map((row:any)=>{const link=links.get(row.id);const {attachmentEntries,...transferFields}=link||{};return{...row,displayParty:displayName({category:row.category,name:row.party}),...transferFields,attachments:attachments.results.filter((a:any)=>a.entry===row.id||attachmentEntries?.includes(a.entry))}}),summary:summary.results[0],descriptions:options.results.map((r:any)=>JSON.parse(r.data).name)};
}
export async function ledgerAction(body:any){
 const user=await requireStaff(['admin']);
 if(['renameLedgerAccount','archiveLedgerAccount','restoreLedgerAccount'].includes(body.op))return changeLedgerAccount(body,user.email);
 if(body.op==='createLedgerTransfer')return createLedgerTransfer(body,user.email);
 if(body.op==='updateLedgerTransfer'||body.op==='cancelLedgerTransfer')return changeLedgerTransfer(body,user.email);
 if(body.op==='addLedgerParty')return addLedgerAccount(body);
 if(body.op==='addLedgerDescription'){const name=z.string().trim().min(1).max(80).parse(body.name).replace(/\s+/g,' ').normalize('NFC');await db().prepare("INSERT INTO entities(id,kind,data) VALUES(?,'ledger_description',?) ON CONFLICT(id) DO NOTHING").bind('ledger_description:'+name.toLocaleLowerCase(),JSON.stringify({name})).run();return{ok:true,name}}
 if(body.op==='saveLedger'){const data=z.object({category,party:z.string().trim().min(1).max(140),entryDate:date,statement:z.string().trim().min(1).max(180),description:z.string().trim().max(1000),debit:z.number().int().min(0).max(100000000000),credit:z.number().int().min(0).max(100000000000)}).refine(value=>(value.debit>0)!==(value.credit>0),{message:'LEDGER_SIDE_REQUIRED'}).parse(body.data);if(body.id){const key=z.string().uuid().parse(body.id);await ensureLedgerEditable(key);const expected=z.object({category:z.string(),party:z.string(),entryDate:z.string(),statement:z.string(),description:z.string(),debit:z.number(),credit:z.number()}).parse(body.expected);const result=await db().prepare('UPDATE ledger_entries SET category=?,party=?,entry_date=?,statement=?,description=?,debit=?,credit=? WHERE id=? AND category=? AND party=? AND entry_date=? AND statement=? AND description=? AND debit=? AND credit=? AND '+accountAvailable+' AND NOT '+transferLinked).bind(data.category,data.party,data.entryDate,data.statement,data.description,data.debit,data.credit,key,expected.category,expected.party,expected.entryDate,expected.statement,expected.description,expected.debit,expected.credit,data.category,data.party).run();if(!result.meta.changes)fail('LEDGER_CHANGED',409);return{ok:true,id:key}}const newId=crypto.randomUUID();const inserted=await db().prepare('INSERT INTO ledger_entries(id,category,party,entry_date,statement,description,debit,credit,created,actor) SELECT ?,?,?,?,?,?,?,?,?,? WHERE '+accountAvailable).bind(newId,data.category,data.party,data.entryDate,data.statement,data.description,data.debit,data.credit,Date.now(),user.email,data.category,data.party).run();if(!inserted.meta.changes)fail('LEDGER_ACCOUNT_ARCHIVED',409);return{ok:true,id:newId}}
 if(body.op==='deleteLedger'){const id=z.string().uuid().parse(body.id);await ensureLedgerEditable(id);await db().batch([db().prepare("DELETE FROM entities WHERE kind='ledger_attachment' AND json_extract(data,'$.entry')=? AND NOT EXISTS(SELECT 1 FROM ledger_entries WHERE id=? AND "+transferLinked+')').bind(id,id),db().prepare('DELETE FROM ledger_entries WHERE id=? AND NOT '+transferLinked).bind(id)]);return{ok:true}}fail('UNKNOWN_ACTION');
}

export async function ledgerAttachment(id:string){await requireStaff(['admin']);const key=z.string().uuid().parse(id);const row=await db().prepare("SELECT a.data FROM entities a JOIN ledger_entries l ON l.id=json_extract(a.data,'$.entry') WHERE a.id=? AND a.kind='ledger_attachment'").bind(key).first<{data:string}>();if(!row)fail('NOT_FOUND',404);return JSON.parse(row!.data)}
export async function uploadLedgerAttachment(req:Request){await requireStaff(['admin']);if(req.headers.get('origin')!==new URL(req.url).origin)fail('FORBIDDEN',403);const p=new URL(req.url).searchParams,id=z.string().uuid().parse(p.get('entry')),name=z.string().trim().min(1).max(140).parse(p.get('name'));const type=req.headers.get('content-type')||'',limit=type==='application/pdf'?1000000:500000;if(type!=='image/jpeg'&&type!=='application/pdf'||Number(req.headers.get('content-length'))>limit)fail('INVALID_INPUT');const reader=req.body?.getReader();if(!reader)fail('INVALID_INPUT');let total=0;const parts:Uint8Array[]=[];while(true){const {value,done}=await reader!.read();if(done)break;total+=value.byteLength;if(total>limit){await reader!.cancel();fail('ATTACHMENT_TOO_LARGE',413)}parts.push(value)}const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}const jpeg=total>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes[total-2]===255&&bytes[total-1]===217,pdf=total>=5&&bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45;if(type==='image/jpeg'&&!jpeg||type==='application/pdf'&&!pdf)fail('INVALID_INPUT');let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const data={entry:id,name,type,file:'data:'+type+';base64,'+btoa(binary)},key=p.has('id')?z.string().uuid().parse(p.get('id')):crypto.randomUUID();const previous=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='ledger_attachment'").bind(key).first<{data:string}>();if(previous){if(previous.data!==JSON.stringify(data))fail('INVALID_INPUT');return{ok:true,id:key,name,type}}const result=await db().prepare("INSERT INTO entities(id,kind,data) SELECT ?,'ledger_attachment',? WHERE EXISTS(SELECT 1 FROM ledger_entries WHERE id=?) AND (SELECT COUNT(*) FROM entities WHERE kind='ledger_attachment' AND json_extract(data,'$.entry')=?)<5 ON CONFLICT(id) DO NOTHING").bind(key,JSON.stringify(data),id,id).run();if(!result.meta.changes){const existing=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='ledger_attachment'").bind(key).first<{data:string}>();if(existing?.data!==JSON.stringify(data))fail('ATTACHMENT_LIMIT_OR_MISSING_ENTRY',409)}return{ok:true,id:key,name,type}}
