import {z} from 'zod';
import {db,fail} from './arkan-server';
import {requireStaff} from './operations-auth';
import {TRIAL_BOOKING} from './checkin-trial-config';
export const expenseCategories=['fuel','salaries','maintenance','hotels','rent','marketing','government','other'] as const;
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v);
const expenseSchema=z.object({date,category:z.enum(expenseCategories),amount:z.number().positive().max(10000000),description:z.string().trim().min(2).max(300),method:z.enum(['cash','bank','card']),reference:z.string().trim().max(120)});
const dayStart=(d:string)=>Date.parse(d+'T00:00:00+03:00');
const saudiDay=(ms:number)=>new Date(ms+10800000).toISOString().slice(0,10);

// Amounts are in halalas. Periods follow Saudi time: bookings by creation date, private buses by payment/creation date, expenses by their own date.
export async function financeReport(from:string,to:string){
 await requireStaff(['admin']);const a=date.parse(from),b=date.parse(to);if(a>b||dayStart(b)-dayStart(a)>366*86400000)fail('DATE_RANGE');
 const start=dayStart(a),end=dayStart(b)+86400000;
 const bookings=(await db().prepare("SELECT b.code,b.amount,b.status,b.created,EXISTS(SELECT 1 FROM entities e WHERE e.kind='package_hold' AND json_extract(e.data,'$.token')=b.hold_token) package FROM bookings b WHERE b.created>=? AND b.created<? AND b.code<>? AND b.status<>'test'").bind(start,end,TRIAL_BOOKING).all<any>()).results;
 const privates=(await db().prepare("SELECT data FROM entities WHERE kind='private_booking' AND json_extract(data,'$.price') IS NOT NULL AND json_extract(data,'$.status')<>'cancelled'").all<any>()).results.map(r=>JSON.parse(r.data));
 const expenses=(await db().prepare("SELECT id,data FROM entities WHERE kind='expense' AND json_extract(data,'$.date')>=? AND json_extract(data,'$.date')<=? ORDER BY json_extract(data,'$.date') DESC").bind(a,b).all<any>()).results.map(r=>({id:r.id,...JSON.parse(r.data)}));
 const income={trips:{paid:0,unpaid:0,count:0},packages:{paid:0,unpaid:0,count:0},private:{paid:0,unpaid:0,count:0}},cancelled={count:0,amount:0},days:Record<string,{income:number;expenses:number}>={} as any;
 const addDay=(d:string,key:'income'|'expenses',v:number)=>{days[d]??={income:0,expenses:0};days[d][key]+=v};
 for(const row of bookings){if(row.status==='cancelled'){cancelled.count++;cancelled.amount+=row.amount;continue}const bucket=row.package?income.packages:income.trips;bucket.count++;if(row.status==='paid'){bucket.paid+=row.amount;addDay(saudiDay(row.created),'income',row.amount)}else bucket.unpaid+=row.amount}
 for(const p of privates){const paidAt=p.paymentStatus==='paid'?[...(p.paymentEvents||[])].reverse().find((e:any)=>e.to==='paid')?.at??p.updated:null,at=paidAt??p.created;if(at<start||at>=end)continue;income.private.count++;if(paidAt){income.private.paid+=p.price;addDay(saudiDay(paidAt),'income',p.price)}else income.private.unpaid+=p.price}
 const byCategory:Record<string,number>={};let spent=0;for(const e of expenses){spent+=e.amount;byCategory[e.category]=(byCategory[e.category]||0)+e.amount;addDay(e.date,'expenses',e.amount)}
 const collected=income.trips.paid+income.packages.paid+income.private.paid,outstanding=income.trips.unpaid+income.packages.unpaid+income.private.unpaid;
 return{from:a,to:b,income,cancelled,collected,outstanding,expenses:spent,net:collected-spent,byCategory,expenseList:expenses,days:Object.entries(days).sort(([x],[y])=>x.localeCompare(y)).map(([day,v])=>({day,...v}))};
}
export async function saveExpense(id:string|undefined,data:unknown,actor:string){const d=expenseSchema.parse(data);const key=id?z.string().startsWith('expense-').max(180).parse(id):'expense-'+crypto.randomUUID();const value={...d,amount:Math.round(d.amount*100),updatedBy:actor,updated:Date.now()};await db().prepare("INSERT INTO entities(id,kind,data) VALUES(?,'expense',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE entities.kind='expense'").bind(key,JSON.stringify(value)).run();return{ok:true,id:key}}
