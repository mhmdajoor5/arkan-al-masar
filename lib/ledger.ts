import {z} from 'zod';
import {db,fail} from './arkan-server';
import {requireStaff} from './operations-auth';

const category=z.enum(['supplier','customer','driver','purchase','management','debt','rent']);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v);

const transferAccount=z.object({category,name:z.string().min(1).max(140).refine(v=>v.trim().length>0)});
const transferData=z.object({from:transferAccount,to:transferAccount,amount:z.number().int().positive().max(100000000000),entryDate:date,statement:z.string().trim().min(1).max(180)});
const transferLinked="EXISTS(SELECT 1 FROM entities t WHERE t.kind='ledger_transfer' AND (json_extract(t.data,'$.fromEntryId')=ledger_entries.id OR json_extract(t.data,'$.toEntryId')=ledger_entries.id))";
const accountExists="EXISTS(SELECT 1 FROM ledger_entries WHERE category=? AND party=? UNION ALL SELECT 1 FROM entities WHERE ((kind='ledger_party' AND json_extract(data,'$.category')=?) OR (kind='driver' AND ?='driver')) AND json_extract(data,'$.name')=?)";

async function ensureLedgerEditable(id:string){
 if(await db().prepare("SELECT 1 FROM entities WHERE kind='ledger_transfer' AND (json_extract(data,'$.fromEntryId')=? OR json_extract(data,'$.toEntryId')=?)").bind(id,id).first())fail('LEDGER_TRANSFER_LOCKED',409);
}

async function createLedgerTransfer(body:any,actor:string){
 const id=z.string().uuid().parse(body.id).toLowerCase(),data=transferData.parse(body.data);
 if(data.from.category===data.to.category&&data.from.name===data.to.name)fail('LEDGER_SAME_ACCOUNT');
 const key='ledger_transfer:'+id,nonce=crypto.randomUUID(),created=Date.now(),fromEntryId=crypto.randomUUID(),toEntryId=crypto.randomUUID();
 const request=JSON.stringify(data),metadata=JSON.stringify({id,request,nonce,fromEntryId,toEntryId,created,actor});
 const accountArgs=(value:z.infer<typeof transferAccount>)=>[value.category,value.name,value.category,value.category,value.name];
 // The metadata nonce claims this request inside the same transaction as both legs.
 // A concurrent/retried request cannot insert a leg unless it won that claim.
 const results=await db().batch([
  db().prepare("INSERT INTO entities(id,kind,data) SELECT ?,'ledger_transfer',? WHERE "+accountExists+' AND '+accountExists+' ON CONFLICT(id) DO NOTHING').bind(key,metadata,...accountArgs(data.from),...accountArgs(data.to)),
  db().prepare("INSERT INTO ledger_entries(id,category,party,entry_date,statement,description,debit,credit,created,actor) SELECT ?,?,?,?,?,?,?,?,?,? FROM entities WHERE id=? AND kind='ledger_transfer' AND json_extract(data,'$.nonce')=?").bind(fromEntryId,data.from.category,data.from.name,data.entryDate,data.statement,'تحويل',data.amount,0,created,actor,key,nonce),
  db().prepare("INSERT INTO ledger_entries(id,category,party,entry_date,statement,description,debit,credit,created,actor) SELECT ?,?,?,?,?,?,?,?,?,? FROM entities WHERE id=? AND kind='ledger_transfer' AND json_extract(data,'$.nonce')=?").bind(toEntryId,data.to.category,data.to.name,data.entryDate,data.statement,'تحويل',0,data.amount,created,actor,key,nonce),
  db().prepare("SELECT data FROM entities WHERE id=? AND kind='ledger_transfer'").bind(key)
 ]);
 const row=results[3].results[0] as {data:string}|undefined;
 if(!row)fail('LEDGER_ACCOUNT_NOT_FOUND',404);
 const saved=JSON.parse(row.data);
 if(saved.request!==request)fail('LEDGER_TRANSFER_CHANGED',409);
 return{ok:true,id,fromEntryId:saved.fromEntryId,toEntryId:saved.toEntryId};
}

export async function ledgerState(categoryValue='',query='',exportAll=false,partyValue=''){
 await requireStaff(['admin']);const selected=categoryValue?category.parse(categoryValue):'',term=query.trim().slice(0,120);let sql='SELECT id,category,party,entry_date entryDate,statement,description,debit,credit,created,actor FROM ledger_entries WHERE 1=1';const args:unknown[]=[];
 if(partyValue){sql+=' AND party=?';args.push(z.string().max(140).parse(partyValue))}
 if(selected){sql+=' AND category=?';args.push(selected)}if(term){sql+=' AND (party LIKE ? OR statement LIKE ? OR description LIKE ?)';const value='%'+term+'%';args.push(value,value,value)}
 const where=sql.slice(sql.indexOf(' WHERE'));
 const [summary,rows]=await db().batch([
  db().prepare('SELECT COUNT(*) count,COALESCE(SUM(debit),0) debit,COALESCE(SUM(credit),0) credit,COALESCE(SUM(credit-debit),0) balance FROM ledger_entries'+where).bind(...args),
  db().prepare('SELECT id,category,party,entry_date entryDate,statement,description,debit,credit,created,actor,SUM(credit-debit) OVER (ORDER BY entry_date,created,id ROWS UNBOUNDED PRECEDING) running FROM ledger_entries'+where+' ORDER BY entry_date DESC,created DESC,id DESC LIMIT '+(exportAll?10001:500)).bind(...args)
 ]);
 if(exportAll&&Number((summary.results[0] as any)?.count)>10000)fail('LEDGER_EXPORT_LIMIT',400);
 const options=await db().prepare("SELECT data FROM entities WHERE kind='ledger_description' ORDER BY id").all();
 const partyRows=await db().prepare("SELECT category,party name FROM ledger_entries GROUP BY category,party UNION SELECT json_extract(data,'$.category') category,json_extract(data,'$.name') name FROM entities WHERE kind='ledger_party' UNION SELECT 'driver' category,json_extract(data,'$.name') name FROM entities WHERE kind='driver' ORDER BY category,name").all();
 const attachments=await db().prepare("SELECT id,json_extract(data,'$.entry') entry,json_extract(data,'$.name') name FROM entities WHERE kind='ledger_attachment'").all();
 const balances=await db().prepare('SELECT category,party name,COUNT(*) count,SUM(debit) debit,SUM(credit) credit,SUM(credit-debit) balance FROM ledger_entries GROUP BY category,party').all();
 const transfers=await db().prepare("SELECT data FROM entities WHERE kind='ledger_transfer'").all<{data:string}>();
 const links=new Map<string,{transferId:string,transferPeer:z.infer<typeof transferAccount>,peerEntryId:string}>();
 for(const row of transfers.results){const value=JSON.parse(row.data),request=JSON.parse(value.request);links.set(value.fromEntryId,{transferId:value.id,transferPeer:request.to,peerEntryId:value.toEntryId});links.set(value.toEntryId,{transferId:value.id,transferPeer:request.from,peerEntryId:value.fromEntryId})}
 return {accounts:partyRows.results.map((p:any)=>({...p,count:0,debit:0,credit:0,balance:0,...balances.results.find((b:any)=>b.category===p.category&&b.name===p.name)})),parties:partyRows.results,entries:rows.results.map((row:any)=>{const link=links.get(row.id);return{...row,...(link?{transferId:link.transferId,transferPeer:link.transferPeer}:{}),attachments:attachments.results.filter((a:any)=>a.entry===row.id||a.entry===link?.peerEntryId)}}),summary:summary.results[0],descriptions:options.results.map((r:any)=>JSON.parse(r.data).name)};
}
export async function ledgerAction(body:any){
 const user=await requireStaff(['admin']);
 if(body.op==='createLedgerTransfer')return createLedgerTransfer(body,user.email);
 if(body.op==='addLedgerParty'){const section=category.parse(body.category),name=z.string().trim().min(1).max(140).parse(body.name).replace(/\s+/g,' ').normalize('NFC');const key='ledger_party:'+section+':'+name.toLocaleLowerCase();await db().prepare("INSERT INTO entities(id,kind,data) VALUES(?,'ledger_party',?) ON CONFLICT(id) DO NOTHING").bind(key,JSON.stringify({category:section,name})).run();const saved=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='ledger_party'").bind(key).first<{data:string}>();return{ok:true,party:JSON.parse(saved!.data)}}
 if(body.op==='addLedgerDescription'){const name=z.string().trim().min(1).max(80).parse(body.name).replace(/\s+/g,' ').normalize('NFC');await db().prepare("INSERT INTO entities(id,kind,data) VALUES(?,'ledger_description',?) ON CONFLICT(id) DO NOTHING").bind('ledger_description:'+name.toLocaleLowerCase(),JSON.stringify({name})).run();return{ok:true,name}}
 if(body.op==='saveLedger'){const data=z.object({category,party:z.string().trim().min(1).max(140),entryDate:date,statement:z.string().trim().min(1).max(180),description:z.string().trim().max(1000),debit:z.number().int().min(0).max(100000000000),credit:z.number().int().min(0).max(100000000000)}).refine(value=>(value.debit>0)!==(value.credit>0),{message:'LEDGER_SIDE_REQUIRED'}).parse(body.data);if(body.id){const key=z.string().uuid().parse(body.id);await ensureLedgerEditable(key);const expected=z.object({category:z.string(),party:z.string(),entryDate:z.string(),statement:z.string(),description:z.string(),debit:z.number(),credit:z.number()}).parse(body.expected);const result=await db().prepare('UPDATE ledger_entries SET category=?,party=?,entry_date=?,statement=?,description=?,debit=?,credit=? WHERE id=? AND category=? AND party=? AND entry_date=? AND statement=? AND description=? AND debit=? AND credit=? AND NOT '+transferLinked).bind(data.category,data.party,data.entryDate,data.statement,data.description,data.debit,data.credit,key,expected.category,expected.party,expected.entryDate,expected.statement,expected.description,expected.debit,expected.credit).run();if(!result.meta.changes)fail('LEDGER_CHANGED',409);return{ok:true}}await db().prepare('INSERT INTO ledger_entries(id,category,party,entry_date,statement,description,debit,credit,created,actor) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),data.category,data.party,data.entryDate,data.statement,data.description,data.debit,data.credit,Date.now(),user.email).run();return{ok:true}}
 if(body.op==='deleteLedger'){const id=z.string().uuid().parse(body.id);await ensureLedgerEditable(id);await db().batch([db().prepare("DELETE FROM entities WHERE kind='ledger_attachment' AND json_extract(data,'$.entry')=? AND NOT EXISTS(SELECT 1 FROM ledger_entries WHERE id=? AND "+transferLinked+')').bind(id,id),db().prepare('DELETE FROM ledger_entries WHERE id=? AND NOT '+transferLinked).bind(id)]);return{ok:true}}fail('UNKNOWN_ACTION');
}

export async function ledgerAttachment(id:string){await requireStaff(['admin']);const key=z.string().uuid().parse(id);const row=await db().prepare("SELECT a.data FROM entities a JOIN ledger_entries l ON l.id=json_extract(a.data,'$.entry') WHERE a.id=? AND a.kind='ledger_attachment'").bind(key).first<{data:string}>();if(!row)fail('NOT_FOUND',404);return JSON.parse(row!.data)}
export async function uploadLedgerAttachment(req:Request){await requireStaff(['admin']);if(req.headers.get('origin')!==new URL(req.url).origin)fail('FORBIDDEN',403);const p=new URL(req.url).searchParams,id=z.string().uuid().parse(p.get('entry')),name=z.string().trim().min(1).max(140).parse(p.get('name'));if(req.headers.get('content-type')!=='image/jpeg'||Number(req.headers.get('content-length'))>500000)fail('INVALID_INPUT');const reader=req.body?.getReader();if(!reader)fail('INVALID_INPUT');let total=0;const parts:Uint8Array[]=[];while(true){const {value,done}=await reader!.read();if(done)break;total+=value.byteLength;if(total>500000){await reader!.cancel();fail('ATTACHMENT_TOO_LARGE',413)}parts.push(value)}const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}if(total<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes[total-2]!==255||bytes[total-1]!==217)fail('INVALID_INPUT');let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const data={entry:id,name,image:'data:image/jpeg;base64,'+btoa(binary)},key=crypto.randomUUID();const result=await db().prepare("INSERT INTO entities(id,kind,data) SELECT ?,'ledger_attachment',? WHERE EXISTS(SELECT 1 FROM ledger_entries WHERE id=?) AND (SELECT COUNT(*) FROM entities WHERE kind='ledger_attachment' AND json_extract(data,'$.entry')=?)<5").bind(key,JSON.stringify(data),id,id).run();if(!result.meta.changes)fail('ATTACHMENT_LIMIT_OR_MISSING_ENTRY',409);return{ok:true,id:key,name}}
