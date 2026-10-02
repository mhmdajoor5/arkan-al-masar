import {z} from 'zod';
import {db,fail} from './arkan-server';

const account=z.object({category:z.enum(['supplier','customer','driver','purchase','management','debt','rent']),name:z.string().min(1).max(140)});
const normalizedName=z.string().trim().min(1).max(140).transform(value=>value.replace(/\s+/g,' ').normalize('NFC'));
// The original category/name remains the stable accounting identity. Renaming
// changes its label everywhere without rewriting amounts, transfers or drivers.
export const accountSources="SELECT category,party name FROM ledger_entries GROUP BY category,party UNION SELECT json_extract(data,'$.category') category,json_extract(data,'$.name') name FROM entities WHERE kind='ledger_party' UNION SELECT 'driver' category,json_extract(data,'$.name') name FROM entities WHERE kind='driver'";
export const accountDirectory="SELECT a.category,a.name,COALESCE(json_extract(p.data,'$.displayName'),a.name) displayName,COALESCE(json_extract(p.data,'$.archived'),0) archived,COALESCE(json_extract(p.data,'$.revision'),0) revision FROM ("+accountSources+") a LEFT JOIN entities p ON p.kind='ledger_account' AND json_extract(p.data,'$.category')=a.category AND json_extract(p.data,'$.name')=a.name";
export const accountAvailable="NOT EXISTS(SELECT 1 FROM entities WHERE kind='ledger_account' AND json_extract(data,'$.category')=? AND json_extract(data,'$.name')=? AND json_extract(data,'$.archived')=1)";
const profileKey=(value:z.infer<typeof account>)=>'ledger_account:'+JSON.stringify([value.category,value.name]);

export async function addLedgerAccount(body:any){
 const section=account.shape.category.parse(body.category),name=normalizedName.parse(body.name);
 const match='category=? AND (lower(name)=lower(?) OR lower(displayName)=lower(?))';
 const key='ledger_party:'+section+':'+name.toLocaleLowerCase();
 await db().prepare("INSERT INTO entities(id,kind,data) SELECT ?,'ledger_party',? WHERE NOT EXISTS(SELECT 1 FROM ("+accountDirectory+') WHERE '+match+') ON CONFLICT(id) DO NOTHING').bind(key,JSON.stringify({category:section,name}),section,name,name).run();
 const saved=await db().prepare('SELECT * FROM ('+accountDirectory+') WHERE '+match+' LIMIT 1').bind(section,name,name).first<any>();
 if(!saved)fail('LEDGER_ACCOUNT_CHANGED',409);
 if(saved.archived)fail('LEDGER_ACCOUNT_ARCHIVED',409);
 return{ok:true,party:saved};
}

export async function changeLedgerAccount(body:any,actor:string){
 const target=account.parse(body.account),expected=z.number().int().nonnegative().parse(body.expectedRevision);
 const requestId=z.string().uuid().parse(body.requestId),op=z.enum(['renameLedgerAccount','archiveLedgerAccount','restoreLedgerAccount']).parse(body.op);
 const displayName=op==='renameLedgerAccount'?normalizedName.parse(body.name):null;
 const request=JSON.stringify({target,expected,op,displayName}),eventKey='ledger_account_change:'+requestId;
 const replay=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='ledger_account_change'").bind(eventKey).first<{data:string}>();
 if(replay){const saved=JSON.parse(replay.data);if(saved.request!==request)fail('LEDGER_ACCOUNT_CHANGED',409);return saved.result}
 const before=await db().prepare('SELECT * FROM ('+accountDirectory+') WHERE category=? AND name=?').bind(target.category,target.name).first<any>();
 if(!before)fail('LEDGER_ACCOUNT_NOT_FOUND',404);
 if(before.revision!==expected)fail('LEDGER_ACCOUNT_CHANGED',409);
 const after={...target,displayName:displayName||before.displayName,archived:op==='archiveLedgerAccount'?1:op==='restoreLedgerAccount'?0:before.archived,revision:expected+1,requestId,updated:Date.now(),updatedBy:actor};
 const key=profileKey(target),result={ok:true,account:after};
 const duplicate='SELECT 1 FROM ('+accountDirectory+') WHERE category=? AND name<>? AND (lower(displayName)=lower(?) OR lower(name)=lower(?))';
 const args=[target.category,target.name,after.displayName,after.displayName];
 if(await db().prepare(duplicate).bind(...args).first())fail('LEDGER_ACCOUNT_NAME_EXISTS',409);
 // Claim the expected revision and audit together. Retries do not repeat a change.
 const commands=[
  db().prepare("INSERT INTO entities(id,kind,data) SELECT ?,'ledger_account',? WHERE EXISTS(SELECT 1 FROM ("+accountSources+') WHERE category=? AND name=?) AND COALESCE((SELECT json_extract(data,\'$.revision\') FROM entities WHERE id=?),0)=? AND NOT EXISTS('+duplicate+") AND NOT EXISTS(SELECT 1 FROM entities WHERE id=?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(key,JSON.stringify(after),target.category,target.name,key,expected,...args,eventKey),
  db().prepare("INSERT INTO entities(id,kind,data) SELECT ?,'ledger_account_change',? WHERE EXISTS(SELECT 1 FROM entities WHERE id=? AND json_extract(data,'$.requestId')=?) ON CONFLICT(id) DO NOTHING").bind(eventKey,JSON.stringify({request,before,after,actor,created:after.updated,result}),key,requestId),
  db().prepare("SELECT data FROM entities WHERE id=? AND kind='ledger_account_change'").bind(eventKey)
 ];
 const results=await db().batch(commands),saved=results[2].results[0] as {data:string}|undefined;
 if(!saved)fail('LEDGER_ACCOUNT_CHANGED',409);
 const completed=JSON.parse(saved!.data);if(completed.request!==request)fail('LEDGER_ACCOUNT_CHANGED',409);
 return completed.result;
}
