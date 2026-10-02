'use client';
import {useEffect,useRef,useState} from 'react';
import {CalendarClock,Plus,Edit3,ArrowRight} from 'lucide-react';
import {api,errorMessage,money,useLocale} from '@/lib/arkan-client';
import {followingMonth,saudiMonth,type MonthlyRule} from '@/lib/monthly-ledger-core';
import type {LedgerAccount} from './ledger-account-dialog';
import {toast} from 'sonner';

const categories=[['supplier','مورد','Supplier'],['customer','عميل','Customer'],['driver','سائق','Driver'],['purchase','مشتريات','Purchases'],['management','إدارة','Administration'],['debt','ديون','Debts'],['rent','إيجار','Rent']];
type Draft={id:string;revision:number;kind:MonthlyRule['kind'];account:string;title:string;amount:string;side:MonthlyRule['side'];active:boolean;startMonth:string};
export default function MonthlyLedgerPanel({accounts,onClose}:{accounts:LedgerAccount[];onClose:()=>void}){
 const {en,t}=useLocale(),[rules,setRules]=useState<MonthlyRule[]>([]),[history,setHistory]=useState<any[]>([]);
 const [earliest,setEarliest]=useState(followingMonth(saudiMonth())),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[attempted,setAttempted]=useState(false);
 const requestId=useRef(''),inFlight=useRef(false),formRef=useRef<HTMLFormElement>(null);
 const key=(a:{category:string;name:string})=>JSON.stringify([a.category,a.name]);
 const label=(category:string,party:string)=>accounts.find(a=>a.category===category&&a.name===party)?.displayName||party;
 const kindLabel=(kind:string)=>kind==='salary'?t('راتب سائق','Driver salary'):kind==='rent'?t('إيجار','Rent'):t('التزام شهري','Monthly obligation');
 const reportError=(e:any)=>e.message==='MONTHLY_CHANGED'?t('تغيّر هذا الالتزام. ألغِ النموذج وأعد فتحه لتحميل آخر نسخة.','This rule changed. Cancel and reopen the form.'):e.message==='LEDGER_ACCOUNT_ARCHIVED'?t('الحساب محذوف. استرجعه قبل تفعيل الالتزام.','Restore the deleted account before activating this rule.'):e.message==='MONTHLY_START_DATE'?t('اختر شهرًا من الشهر القادم وحتى سنة بعده.','Choose next month or a month within the following year.'):errorMessage(e,en);
 async function load(){setLoading(true);try{const data=await api('monthlyLedger');setRules(data.rules);setHistory(data.history);setEarliest(data.earliestMonth);setError('')}catch(e){setError(reportError(e))}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 useEffect(()=>{if(draft)formRef.current?.scrollIntoView({behavior:'smooth',block:'start'})},[draft?.id]);
 function open(rule?:MonthlyRule){setError('');setAttempted(false);requestId.current=crypto.randomUUID();setDraft(rule?{id:rule.id,revision:rule.revision,kind:rule.kind,account:JSON.stringify([rule.category,rule.party]),title:rule.title,amount:String(rule.amount/100),side:rule.side,active:rule.active,startMonth:rule.nextMonth>earliest?rule.nextMonth:earliest}:{id:crypto.randomUUID(),revision:0,kind:'salary',account:'',title:'',amount:'',side:'credit',active:true,startMonth:earliest})}
 async function save(event:React.FormEvent){
  event.preventDefault();if(!draft||inFlight.current)return;
  const amount=Math.round(Number(draft.amount)*100);
  if(!Number.isSafeInteger(amount)||amount<=0||amount>100000000000){setError(t('أدخل مبلغًا صحيحًا أكبر من صفر.','Enter a valid positive amount.'));return}
  const [category,party]=JSON.parse(draft.account);
  inFlight.current=true;setBusy(true);setAttempted(true);setError('');
  try{await api('saveMonthlyLedger',{id:draft.id,requestId:requestId.current,expectedRevision:draft.revision,data:{category,party,title:draft.title,kind:draft.kind,amount,side:draft.side,active:draft.active,startMonth:draft.startMonth}});setDraft(null);toast.success(t('تم حفظ الالتزام الشهري','Monthly rule saved'));await load()}catch(e){setError(reportError(e))}finally{inFlight.current=false;setBusy(false)}
 }
 return <section className="panel monthly-ledger">
  <button className="secondary" disabled={busy} onClick={onClose}><ArrowRight size={17}/>{t('العودة إلى الحسابات','Back to accounts')}</button>
  <div className="section-heading"><div><h2><CalendarClock size={24}/> {t('الالتزامات الشهرية التلقائية','Automatic monthly obligations')}</h2><p>{t('حدد المبلغ والحساب مرة واحدة. تُسجّل الحركة يوم ١ من كل شهر بتوقيت السعودية، حتى لو لم تفتح التطبيق.','Set the account and amount once. Entries post on the 1st in Saudi time, even when the app is closed.')}</p></div><button className="primary" disabled={loading||busy||!!draft} onClick={()=>open()}><Plus size={18}/>{t('إعداد التزام شهري','Set up monthly obligation')}</button></div>
  <p className="monthly-note">{t('هذه قيود استحقاق في كشف الحساب؛ لا تُحوّل أموالًا. يبدأ الالتزام الجديد من الشهر القادم أو شهر لاحق تختاره.','These are ledger accruals; no funds are transferred. New rules start next month or a later month you choose.')}</p>
  {error&&<p className="ops-error" role="alert">{error}</p>}
  {draft&&<form ref={formRef} className="accounting-form" onSubmit={save}>
   <h3 className="accounting-description">{draft.revision?t('تعديل الالتزام','Edit obligation'):t('إعداد مرة واحدة','One-time setup')}</h3>
   <fieldset disabled={busy||attempted} className="monthly-fields">
    <label>{t('نوع الالتزام','Type')}<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as Draft['kind']})}><option value="salary">{kindLabel('salary')}</option><option value="rent">{kindLabel('rent')}</option><option value="obligation">{kindLabel('obligation')}</option></select></label>
    <label>{t('الحساب','Account')}<select required value={draft.account} onChange={e=>setDraft({...draft,account:e.target.value})}><option value="">{t('اختر الحساب','Choose account')}</option>{accounts.filter(a=>!a.archived||key(a)===draft.account).map(a=><option value={key(a)} key={key(a)}>{a.displayName||a.name} · {categories.find(c=>c[0]===a.category)?.[en?2:1]}{a.archived?t(' (محذوف)',' (deleted)'):''}</option>)}</select></label>
    <label>{t('البيان، مثال: راتب السائق أحمد','Statement, e.g. Ahmed’s salary')}<input required maxLength={150} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
    <label>{t('المبلغ الشهري (ر.س)','Monthly amount (SAR)')}<input required type="number" inputMode="decimal" min="0.01" max="1000000000" step="0.01" dir="ltr" value={draft.amount} onChange={e=>setDraft({...draft,amount:e.target.value})}/></label>
    <label>{t('جهة القيد','Ledger side')}<select value={draft.side} onChange={e=>setDraft({...draft,side:e.target.value as Draft['side']})}><option value="credit">{t('دائن — مستحق له','Credit — owed to this account')}</option><option value="debit">{t('مدين — مستحق عليه','Debit — owed by this account')}</option></select></label>
    <label>{t('شهر بدء الإعداد الجديد','Settings start month')}<input type="month" required min={earliest} max={String(Number(earliest.slice(0,4))+1)+earliest.slice(4)} value={draft.startMonth} onChange={e=>setDraft({...draft,startMonth:e.target.value})}/></label>
    <label>{t('الحالة','Status')}<select value={draft.active?'active':'paused'} onChange={e=>setDraft({...draft,active:e.target.value==='active'})}><option value="active">{t('مفعّل — تسجيل تلقائي','Active — automatic entries')}</option><option value="paused">{t('متوقف — دون قيود جديدة','Paused — no new entries')}</option></select></label>
   </fieldset>
   <p className="accounting-description monthly-note">{t('تُحفظ الحركات السابقة كما هي. لا تُحتسب الأشهر أثناء الإيقاف أو حذف الحساب، ولا تتكرر الحركة عند إعادة التشغيل.','Existing entries are preserved. Paused or deleted-account months are skipped, and retries cannot duplicate entries.')}</p>
   <div className="ledger-actions accounting-description"><button className="primary" disabled={busy||!draft.account} type="submit">{busy?t('جارٍ الحفظ…','Saving…'):attempted?t('إعادة محاولة الحفظ','Retry save'):t('حفظ الإعداد','Save settings')}</button><button type="button" className="secondary" disabled={busy} onClick={()=>{setDraft(null);void load()}}>{t('إلغاء','Cancel')}</button></div>
  </form>}
  {!accounts.some(a=>!a.archived)&&<p>{t('أضف حساب السائق أو المؤجر من صفحة الحسابات أولًا.','Add the driver or landlord account from Accounts first.')}</p>}
  <div className="monthly-rules">{rules.map(rule=>{const archived=!!accounts.find(a=>a.category===rule.category&&a.name===rule.party)?.archived;return <article key={rule.id} className="monthly-rule"><div><span className="monthly-status">{!rule.active?t('متوقف','Paused'):archived?t('الحساب محذوف — يُتخطّى','Deleted account — skipped'):t('مفعّل','Active')}</span><h3>{rule.title}</h3><p>{label(rule.category,rule.party)} · {kindLabel(rule.kind)}</p><b className={rule.side==='debit'?'monthly-debit':''}>{money(rule.amount,en)} · {rule.side==='credit'?t('دائن','Credit'):t('مدين','Debit')}</b><p>{rule.active?t('القيد القادم: ','Next entry: ')+rule.nextMonth+'-01':t('لا توجد قيود مجدولة أثناء الإيقاف','No entries while paused')}{rule.lastPosted&&<><br/>{t('آخر شهر مسجّل: ','Last posted month: ')}{rule.lastPosted}</>}</p></div><button className="secondary" disabled={busy||!!draft} onClick={()=>open(rule)}><Edit3 size={17}/>{t('تعديل / إيقاف','Edit / pause')}</button></article>})}</div>
  {!rules.length&&<p className="ops-empty">{loading?t('جارٍ التحميل…','Loading…'):t('لم تُضف التزامات شهرية بعد. إعداد واحد يكفي للتكرار كل شهر.','No monthly rules yet. Set one up once to repeat each month.')}</p>}
  {!!history.length&&<details><summary>{t('آخر عمليات التسجيل التلقائي','Recent automatic entries')}</summary><ul className="monthly-history">{history.map(item=><li key={item.ruleId+item.month}>{item.rule.title} · {item.month} · {item.status==='posted'?t('تم التسجيل','Posted'):t('تم التخطي: الحساب محذوف','Skipped: deleted account')}</li>)}</ul></details>}
 </section>;
}
