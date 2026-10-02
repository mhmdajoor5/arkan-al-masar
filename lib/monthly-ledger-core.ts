// This module is also used by the scheduled Worker; it must not import Next APIs.
export type MonthlyRule = {
 id:string; category:string; party:string; title:string; kind:'salary'|'rent'|'obligation';
 amount:number; side:'credit'|'debit'; active:boolean; nextMonth:string;
 revision:number; updated:number; actor:string; lastPosted?:string;
};
export const saudiMonth=(at=Date.now())=>new Date(at+3*60*60*1000).toISOString().slice(0,7);
export function followingMonth(month:string){
 const [year,value]=month.split('-').map(Number);
 return `${year+(value===12?1:0)}-${String(value===12?1:value+1).padStart(2,'0')}`;
}
export const availableAccount="NOT EXISTS(SELECT 1 FROM entities WHERE kind='ledger_account' AND json_extract(data,'$.category')=? AND json_extract(data,'$.name')=? AND json_extract(data,'$.archived')=1)";

export async function postMonthlyLedger(database:D1Database,at=Date.now()){
 const month=saudiMonth(at);
 const rules=await database.prepare("SELECT id,data FROM entities WHERE kind='ledger_monthly' AND json_extract(data,'$.active')=1 AND json_extract(data,'$.nextMonth')<=? ORDER BY json_extract(data,'$.nextMonth') LIMIT 200").bind(month).all<{id:string;data:string}>();
 let posted=0,skipped=0,handled=0;
 for(const initial of rules.results){
  let raw=initial.data;
  // Bounded catch-up: another hourly run continues if there is a long outage.
  for(let attempt=0;attempt<24;attempt++){
   if(handled++>=100)return{posted,skipped};
   const rule=JSON.parse(raw) as MonthlyRule;
   if(!rule.active||rule.nextMonth>month)break;
   const due=rule.nextMonth,key=`ledger_monthly_post:${rule.id}:${due}`,nonce=crypto.randomUUID();
   const active=await database.prepare('SELECT '+availableAccount+' AS active').bind(rule.category,rule.party).first<{active:number}>();
   const allowed=!!active?.active;
   const record={ruleId:rule.id,month:due,entryId:allowed?nonce:null,status:allowed?'posted':'skipped_archived',nonce,created:at,rule};
   const next={...rule,nextMonth:followingMonth(due),...(allowed?{lastPosted:due}:{})};
   // Claim, entry, and cursor are one D1 transaction. The monthly claim survives
   // manual deletion of a ledger entry so a retry cannot re-create it.
   const results=await database.batch([
    database.prepare("INSERT INTO entities(id,kind,data) SELECT ?,'ledger_monthly_post',? WHERE EXISTS(SELECT 1 FROM entities WHERE id=? AND kind='ledger_monthly' AND data=?) AND ("+availableAccount+")=? ON CONFLICT(id) DO NOTHING").bind(key,JSON.stringify(record),initial.id,raw,rule.category,rule.party,allowed?1:0),
    database.prepare("INSERT INTO ledger_entries(id,category,party,entry_date,statement,description,debit,credit,created,actor) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM entities WHERE id=? AND json_extract(data,'$.nonce')=? AND json_extract(data,'$.status')='posted')").bind(nonce,rule.category,rule.party,due+'-01',rule.title+' — '+due,rule.kind==='salary'?'راتب شهري تلقائي':rule.kind==='rent'?'إيجار شهري تلقائي':'التزام شهري تلقائي',rule.side==='debit'?rule.amount:0,rule.side==='credit'?rule.amount:0,at,'system:monthly-ledger',key,nonce),
    database.prepare("UPDATE entities SET data=? WHERE id=? AND data=? AND EXISTS(SELECT 1 FROM entities WHERE id=?)").bind(JSON.stringify(next),initial.id,raw,key)
   ]);
   if(results[1].meta.changes)posted++;
   if(results[0].meta.changes&&!allowed)skipped++;
   if(!results[2].meta.changes)break;
   raw=JSON.stringify(next);
  }
 }
 return{posted,skipped};
}
