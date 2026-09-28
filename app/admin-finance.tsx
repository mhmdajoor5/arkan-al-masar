'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Plus,Edit3,Trash2,Download,Wallet,TrendingUp,TrendingDown,Hourglass,LoaderCircle} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {toast} from 'sonner';
import {api,Choice,dateNow,errorMessage,money,useLocale} from '@/lib/arkan-client';
import GridTable from './admin-grid-table';

const categories=['fuel','salaries','maintenance','hotels','rent','marketing','government','other'];
const shift=(d:string,days:number)=>new Date(Date.parse(d+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
function preset(kind:string){const today=dateNow(),month=today.slice(0,8)+'01';
 if(kind==='lastMonth'){const end=shift(month,-1);return{from:end.slice(0,8)+'01',to:end}}
 if(kind==='year')return{from:today.slice(0,5)+'01-01',to:today};
 if(kind==='today')return{from:today,to:today};
 return{from:month,to:today}}

export default function AdminFinance(){
 const{en,t}=useLocale();const[period,setPeriod]=useState('month'),[range,setRange]=useState(()=>preset('month'));
 const[report,setReport]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const[edit,setEdit]=useState<any>(null),[remove,setRemove]=useState<any>(null),[busy,setBusy]=useState(false),[formError,setFormError]=useState('');
 const loadId=useRef(0);
 const categoryLabel=(c:string)=>({fuel:t('وقود','Fuel'),salaries:t('رواتب','Salaries'),maintenance:t('صيانة','Maintenance'),hotels:t('فنادق','Hotels'),rent:t('إيجار','Rent'),marketing:t('تسويق','Marketing'),government:t('رسوم حكومية','Government fees'),other:t('أخرى','Other')} as Record<string,string>)[c]||c;
 const methodLabel=(m:string)=>m==='bank'?t('تحويل بنكي','Bank transfer'):m==='card'?t('بطاقة','Card'):t('نقدًا','Cash');
 const load=useCallback(async()=>{const id=++loadId.current;setLoading(true);try{const next=await api('finance&from='+range.from+'&to='+range.to);if(id===loadId.current){setReport(next);setError('')}}catch(e){if(id===loadId.current)setError(errorMessage(e,en))}finally{if(id===loadId.current)setLoading(false)}},[range,en]);
 useEffect(()=>{void load();return()=>{loadId.current++}},[load]);
 function exportCSV(){if(!report)return;const cell=(v:any)=>'"'+String(v??'').replaceAll('"','""')+'"';const sar=(n:number)=>(n/100).toFixed(2);
  const lines=[[t('الفترة','Period'),report.from,report.to],[],[t('البند','Item'),t('العدد','Count'),t('المحصّل','Collected'),t('غير المحصّل','Outstanding')],...[['trips',t('تذاكر الرحلات','Trip tickets')],['packages',t('الباقات','Packages')],['private',t('الحافلات الخاصة','Private buses')]].map(([k,l])=>[l,report.income[k].count,sar(report.income[k].paid),sar(report.income[k].unpaid)]),[t('إجمالي المحصّل','Total collected'),'',sar(report.collected),sar(report.outstanding)],[t('إجمالي المصروفات','Total expenses'),'',sar(report.expenses)],[t('الصافي','Net'),'',sar(report.net)],[],[t('التاريخ','Date'),t('التصنيف','Category'),t('الوصف','Description'),t('طريقة الدفع','Method'),t('المرجع','Reference'),t('المبلغ','Amount')],...report.expenseList.map((x:any)=>[x.date,categoryLabel(x.category),x.description,methodLabel(x.method),x.reference,sar(x.amount)])];
  const url=URL.createObjectURL(new Blob(['﻿'+lines.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='finance-'+report.from+'-'+report.to+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 const r=report,maxCategory=r?Math.max(1,...Object.values(r.byCategory as Record<string,number>)):1;
 return <div className="finance-page">
  <section className="panel"><div className="ops-filters finance-filters">
   <Choice label={t('الفترة','Period')} value={period} onChange={v=>{setPeriod(v);if(v!=='custom')setRange(preset(v))}} options={[{value:'today',label:t('اليوم','Today')},{value:'month',label:t('هذا الشهر','This month')},{value:'lastMonth',label:t('الشهر الماضي','Last month')},{value:'year',label:t('هذه السنة','This year')},{value:'custom',label:t('فترة مخصصة','Custom range')}]}/>
   {period==='custom'&&<><label>{t('من','From')}<input type="date" dir="ltr" value={range.from} max={range.to} onChange={e=>{if(e.target.value)setRange({...range,from:e.target.value})}}/></label><label>{t('إلى','To')}<input type="date" dir="ltr" value={range.to} min={range.from} onChange={e=>{if(e.target.value)setRange({...range,to:e.target.value})}}/></label></>}
   <button className="secondary" type="button" disabled={!r||loading} onClick={exportCSV}><Download size={18}/>{t('تصدير CSV','Export CSV')}</button>
  </div>{error&&<p className="error" role="alert">{error}</p>}</section>
  {!r?<div className="ops-empty"><LoaderCircle className="spin" size={30}/></div>:<div className={loading?'ops-view is-loading':'ops-view'} aria-busy={loading}>
   <div className="stat-grid">{[[t('المبالغ المحصّلة','Collected'),money(r.collected,en),Wallet,t('تذاكر وباقات وحافلات خاصة مدفوعة','Paid tickets, packages and private buses')],[t('غير المحصّل','Outstanding'),money(r.outstanding,en),Hourglass,t('طلبات مؤكدة أو بانتظار الدفع','Confirmed or pending requests')],[t('المصروفات','Expenses'),money(r.expenses,en),TrendingDown,r.expenseList.length+' '+t('قيد','entries')],[t('صافي الربح','Net profit'),money(r.net,en),TrendingUp,t('المحصّل ناقص المصروفات','Collected minus expenses')]].map(([label,value,Icon,note]:any)=><article className={'stat-card'+(label===t('صافي الربح','Net profit')?(r.net<0?' finance-negative':' finance-positive'):'')} key={label}><div><small>{label}</small><span><Icon size={21}/></span></div><strong>{value}</strong><p>{note}</p></article>)}</div>
   <div className="finance-grid">
    <section className="panel admin-table"><div className="section-heading"><div><h2>{t('الإيرادات','Revenue')}</h2><p>{t('حسب تاريخ إنشاء الحجز أو تسجيل الدفع','By booking creation or payment date')}</p></div></div>
     <GridTable headers={[t('المصدر','Source'),t('العدد','Count'),t('المحصّل','Collected'),t('غير المحصّل','Outstanding')]} rows={[['trips',t('تذاكر الرحلات','Trip tickets')],['packages',t('الباقات','Packages')],['private',t('الحافلات الخاصة','Private buses')]].map(([k,l])=>[<b key="l">{l}</b>,r.income[k].count,<span key="p" dir="ltr">{money(r.income[k].paid,en)}</span>,<span key="u" dir="ltr">{money(r.income[k].unpaid,en)}</span>])}/>
     {r.cancelled.count>0&&<p className="ops-form-note">{t('طلبات ملغاة في الفترة: ','Cancelled requests in period: ')}{r.cancelled.count} · {money(r.cancelled.amount,en)}</p>}
    </section>
    <section className="panel"><div className="section-heading"><div><h2>{t('المصروفات حسب التصنيف','Expenses by category')}</h2><p>{money(r.expenses,en)}</p></div></div>
     {Object.keys(r.byCategory).length?<ul className="finance-bars">{Object.entries(r.byCategory as Record<string,number>).sort((a,b)=>b[1]-a[1]).map(([c,v])=><li key={c}><div><span>{categoryLabel(c)}</span><b dir="ltr">{money(v,en)}</b></div><i style={{width:Math.max(3,v/maxCategory*100)+'%'}}/></li>)}</ul>:<p className="ops-form-note">{t('لا توجد مصروفات في هذه الفترة.','No expenses in this period.')}</p>}
    </section>
   </div>
   <section className="panel admin-table"><div className="section-heading"><div><h2>{t('سجل المصروفات','Expense log')}</h2><p>{r.expenseList.length} {t('قيد','entries')}</p></div><button className="primary" onClick={()=>{setEdit({date:range.to>dateNow()?dateNow():range.to,category:'fuel',amount:'',description:'',method:'cash',reference:''});setFormError('')}}><Plus size={18}/>{t('إضافة مصروف','Add expense')}</button></div>
    <GridTable headers={[t('التاريخ','Date'),t('التصنيف','Category'),t('الوصف','Description'),t('المبلغ','Amount'),t('إجراءات','Actions')]} rows={r.expenseList.map((x:any)=>[<span key="d" dir="ltr">{x.date}</span>,categoryLabel(x.category),<div key="desc">{x.description}<small>{methodLabel(x.method)}{x.reference?' · '+x.reference:''}</small></div>,<b key="a" dir="ltr">{money(x.amount,en)}</b>,<div className="row-actions" key="actions"><button className="icon-button" aria-label={t('تعديل','Edit')} title={t('تعديل','Edit')} onClick={()=>{setEdit({...x,amount:x.amount/100});setFormError('')}}><Edit3 size={18}/></button><button className="icon-button ops-danger" aria-label={t('حذف المصروف','Delete expense')} title={t('حذف المصروف','Delete expense')} onClick={()=>setRemove(x)}><Trash2 size={18}/></button></div>])} empty={t('لا توجد مصروفات مسجلة في هذه الفترة.','No expenses recorded for this period.')}/>
   </section>
  </div>}
  {edit&&<Dialog open onOpenChange={open=>{if(!open&&!busy)setEdit(null)}}><DialogContent className="ops-dialog" dir={en?'ltr':'rtl'}><DialogHeader><DialogTitle>{edit.id?t('تعديل مصروف','Edit expense'):t('إضافة مصروف','Add expense')}</DialogTitle><DialogDescription>{t('المبالغ بالريال السعودي.','Amounts are in Saudi riyals.')}</DialogDescription></DialogHeader>
   <form onSubmit={async e=>{e.preventDefault();setBusy(true);setFormError('');try{const{id,date,category,amount,description,method,reference}=edit;await api('saveExpense',{id,data:{date,category,amount:Number(amount),description,method,reference}});setEdit(null);toast.success(t('تم حفظ التغييرات','Changes saved'));await load()}catch(e){setFormError(errorMessage(e,en))}finally{setBusy(false)}}}>
    <div className="form-grid">
     <label>{t('التاريخ','Date')}<input type="date" dir="ltr" required value={edit.date} onChange={e=>setEdit({...edit,date:e.target.value})}/></label>
     <label>{t('التصنيف','Category')}<Choice label={t('التصنيف','Category')} value={edit.category} onChange={v=>setEdit({...edit,category:v})} options={categories.map(c=>({value:c,label:categoryLabel(c)}))}/></label>
     <label>{t('المبلغ — ريال','Amount — SAR')}<input type="number" dir="ltr" required min="0.01" max="10000000" step="0.01" value={edit.amount} onChange={e=>setEdit({...edit,amount:e.target.value})}/></label>
     <label>{t('طريقة الدفع','Payment method')}<Choice label={t('طريقة الدفع','Payment method')} value={edit.method} onChange={v=>setEdit({...edit,method:v})} options={['cash','bank','card'].map(m=>({value:m,label:methodLabel(m)}))}/></label>
     <label>{t('الوصف','Description')}<input required minLength={2} maxLength={300} value={edit.description} onChange={e=>setEdit({...edit,description:e.target.value})}/></label>
     <label>{t('رقم مرجعي / فاتورة — اختياري','Reference / invoice — optional')}<input maxLength={120} value={edit.reference} onChange={e=>setEdit({...edit,reference:e.target.value})}/></label>
    </div>
    {formError&&<p className="error" role="alert">{formError}</p>}
    <div className="ops-dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setEdit(null)}>{t('رجوع','Back')}</button><button className="primary" disabled={busy}>{busy?t('جارٍ الحفظ…','Saving…'):t('حفظ المصروف','Save expense')}</button></div>
   </form></DialogContent></Dialog>}
  <AlertDialog open={!!remove} onOpenChange={open=>{if(!open&&!busy)setRemove(null)}}><AlertDialogContent dir={en?'ltr':'rtl'} className="ops-confirm-dialog"><AlertDialogHeader><AlertDialogTitle>{t('حذف المصروف؟','Delete expense?')}</AlertDialogTitle><AlertDialogDescription><b>{remove?.description} · {remove&&money(remove.amount,en)}</b><br/>{t('سيُحذف هذا القيد نهائيًا من السجل المالي.','This entry will be permanently removed from the finance log.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('رجوع','Back')}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={async e=>{e.preventDefault();setBusy(true);try{await api('deleteEntity',{kind:'expense',id:remove.id});setRemove(null);toast.success(t('تم حذف المصروف','Expense deleted'));await load()}catch(e){toast.error(errorMessage(e,en))}finally{setBusy(false)}}}>{busy?t('جارٍ التنفيذ…','Working…'):t('حذف','Delete')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
