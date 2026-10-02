import {z} from 'zod';
import {db,fail} from './arkan-server';
import {requireStaff} from './operations-auth';
import {accountDirectory} from './ledger-accounts';
import {followingMonth,saudiMonth,postMonthlyLedger,type MonthlyRule} from './monthly-ledger-core';

const dataSchema=z.object({
 category:z.enum(['supplier','customer','driver','purchase','management','debt','rent']),
 party:z.string().min(1).max(140),title:z.string().trim().min(1).max(150),
 kind:z.enum(['salary','rent','obligation']),amount:z.number().int().positive().max(100000000000),
 side:z.enum(['credit','debit']),active:z.boolean(),
 startMonth:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
});
export async function monthlyLedgerState(){
 await requireStaff(['admin']);
 const [rules,history]=await Promise.all([
  db().prepare("SELECT data FROM entities WHERE kind='ledger_monthly' ORDER BY json_extract(data,'$.updated') DESC").all<{data:string}>(),
  db().prepare("SELECT data FROM entities WHERE kind='ledger_monthly_post' ORDER BY json_extract(data,'$.created') DESC LIMIT 20").all<{data:string}>()
 ]);
 return{rules:rules.results.map(r=>JSON.parse(r.data)),history:history.results.map(r=>JSON.parse(r.data)),earliestMonth:followingMonth(saudiMonth())};
}
export async function saveMonthlyLedger(body:any){
 const user=await requireStaff(['admin']);
 const id=z.string().uuid().parse(body.id),requestId=z.string().uuid().parse(body.requestId);
 const expected=z.number().int().nonnegative().parse(body.expectedRevision),data=dataSchema.parse(body.data);
 const key='ledger_monthly:'+id,event='ledger_monthly_change:'+requestId,request=JSON.stringify({id,expected,data});
 const replay=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='ledger_monthly_change'").bind(event).first<{data:string}>();
 if(replay){if(JSON.parse(replay.data).request!==request)fail('MONTHLY_CHANGED',409);return{ok:true}}
 const earliest=followingMonth(saudiMonth());
 const latest=String(Number(earliest.slice(0,4))+1)+earliest.slice(4);
 if(data.startMonth<earliest||data.startMonth>latest)fail('MONTHLY_START_DATE');
 // Settle already-due entries under the old settings before future changes.
 await postMonthlyLedger(db());
 const before=await db().prepare("SELECT data FROM entities WHERE id=? AND kind='ledger_monthly'").bind(key).first<{data:string}>();
 const old=before?JSON.parse(before.data) as MonthlyRule:null;
 if((old?.revision||0)!==expected||(!old&&expected!==0))fail('MONTHLY_CHANGED',409);
 const account=await db().prepare('SELECT * FROM ('+accountDirectory+') WHERE category=? AND name=?').bind(data.category,data.party).first<any>();
 if(!account||(account.archived&&data.active))fail('LEDGER_ACCOUNT_ARCHIVED',409);
 const {startMonth,...fields}=data;
 const rule:MonthlyRule={...fields,id,nextMonth:startMonth,revision:expected+1,updated:Date.now(),actor:user.email,...(old?.lastPosted?{lastPosted:old.lastPosted}:{})};
 const condition="COALESCE((SELECT data FROM entities WHERE id=?),'')=? AND NOT EXISTS(SELECT 1 FROM entities WHERE id=?)";
 const result=await db().batch([
  db().prepare("INSERT INTO entities(id,kind,data) SELECT ?,'ledger_monthly',? WHERE "+condition+" AND EXISTS(SELECT 1 FROM ("+accountDirectory+") WHERE category=? AND name=? AND (archived=0 OR ?=0)) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(key,JSON.stringify(rule),key,before?.data||'',event,data.category,data.party,data.active?1:0),
  db().prepare("INSERT INTO entities(id,kind,data) SELECT ?,'ledger_monthly_change',? WHERE EXISTS(SELECT 1 FROM entities WHERE id=? AND data=?) ON CONFLICT(id) DO NOTHING").bind(event,JSON.stringify({request,before:old,after:rule,actor:user.email,created:rule.updated}),key,JSON.stringify(rule)),
  db().prepare('SELECT data FROM entities WHERE id=?').bind(event)
 ]);
 const saved=result[2].results[0] as {data:string}|undefined;
 if(!saved||JSON.parse(saved.data).request!==request)fail('MONTHLY_CHANGED',409);
 return{ok:true};
}
