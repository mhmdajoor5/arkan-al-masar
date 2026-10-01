import {z} from 'zod';
import {db,fail} from './arkan-server';
import {requireStaff} from './operations-auth';

const category=z.enum(['supplier','customer','driver','purchase','management','debt','rent']);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v);

export async function ledgerState(categoryValue='',query='',exportAll=false){
 await requireStaff(['admin']);const selected=categoryValue?category.parse(categoryValue):'',term=query.trim().slice(0,120);let sql='SELECT id,category,party,entry_date entryDate,statement,description,debit,credit,created,actor FROM ledger_entries WHERE 1=1';const args:unknown[]=[];
 if(selected){sql+=' AND category=?';args.push(selected)}if(term){sql+=' AND (party LIKE ? OR statement LIKE ? OR description LIKE ?)';const value='%'+term+'%';args.push(value,value,value)}
 const where=sql.slice(sql.indexOf(' WHERE'));
 const [summary,rows]=await db().batch([
  db().prepare('SELECT COUNT(*) count,COALESCE(SUM(debit),0) debit,COALESCE(SUM(credit),0) credit,COALESCE(SUM(credit-debit),0) balance FROM ledger_entries'+where).bind(...args),
  db().prepare('SELECT id,category,party,entry_date entryDate,statement,description,debit,credit,created,actor,SUM(credit-debit) OVER (ORDER BY entry_date,created,id ROWS UNBOUNDED PRECEDING) running FROM ledger_entries'+where+' ORDER BY entry_date DESC,created DESC,id DESC LIMIT '+(exportAll?10001:500)).bind(...args)
 ]);
 if(exportAll&&Number((summary.results[0] as any)?.count)>10000)fail('LEDGER_EXPORT_LIMIT',400);
 const options=await db().prepare("SELECT data FROM entities WHERE kind='ledger_description' ORDER BY id").all();
 const partyRows=await db().prepare("SELECT category,party name FROM ledger_entries GROUP BY category,party UNION SELECT json_extract(data,'$.category') category,json_extract(data,'$.name') name FROM entities WHERE kind='ledger_party' UNION SELECT 'driver' category,json_extract(data,'$.name') name FROM entities WHERE kind='driver' ORDER BY category,name").all();
 return {parties:partyRows.results,entries:rows.results,summary:summary.results[0],descriptions:options.results.map((r:any)=>JSON.parse(r.data).name)};
}
export async function ledgerAction(body:any){
 const user=await requireStaff(['admin']);
 if(body.op==='addLedgerParty'){const section=category.parse(body.category),name=z.string().trim().min(1).max(140).parse(body.name).replace(/\s+/g,' ').normalize('NFC');const key='ledger_party:'+section+':'+name.toLocaleLowerCase();await db().prepare("INSERT INTO entities(id,kind,data) VALUES(?,'ledger_party',?) ON CONFLICT(id) DO NOTHING").bind(key,JSON.stringify({category:section,name})).run();const saved=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='ledger_party'").bind(key).first<{data:string}>();return{ok:true,party:JSON.parse(saved!.data)}}
 if(body.op==='addLedgerDescription'){const name=z.string().trim().min(1).max(80).parse(body.name).replace(/\s+/g,' ').normalize('NFC');await db().prepare("INSERT INTO entities(id,kind,data) VALUES(?,'ledger_description',?) ON CONFLICT(id) DO NOTHING").bind('ledger_description:'+name.toLocaleLowerCase(),JSON.stringify({name})).run();return{ok:true,name}}
 if(body.op==='saveLedger'){const data=z.object({category,party:z.string().trim().min(1).max(140),entryDate:date,statement:z.string().trim().min(1).max(180),description:z.string().trim().max(1000),debit:z.number().int().min(0).max(100000000000),credit:z.number().int().min(0).max(100000000000)}).refine(value=>(value.debit>0)!==(value.credit>0),{message:'LEDGER_SIDE_REQUIRED'}).parse(body.data);if(body.id){const key=z.string().uuid().parse(body.id);const expected=z.object({category:z.string(),party:z.string(),entryDate:z.string(),statement:z.string(),description:z.string(),debit:z.number(),credit:z.number()}).parse(body.expected);const result=await db().prepare('UPDATE ledger_entries SET category=?,party=?,entry_date=?,statement=?,description=?,debit=?,credit=? WHERE id=? AND category=? AND party=? AND entry_date=? AND statement=? AND description=? AND debit=? AND credit=?').bind(data.category,data.party,data.entryDate,data.statement,data.description,data.debit,data.credit,key,expected.category,expected.party,expected.entryDate,expected.statement,expected.description,expected.debit,expected.credit).run();if(!result.meta.changes)fail('LEDGER_CHANGED',409);return{ok:true}}await db().prepare('INSERT INTO ledger_entries(id,category,party,entry_date,statement,description,debit,credit,created,actor) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),data.category,data.party,data.entryDate,data.statement,data.description,data.debit,data.credit,Date.now(),user.email).run();return{ok:true}}
 if(body.op==='deleteLedger'){const id=z.string().uuid().parse(body.id);await db().prepare('DELETE FROM ledger_entries WHERE id=?').bind(id).run();return{ok:true}}fail('UNKNOWN_ACTION');
}
