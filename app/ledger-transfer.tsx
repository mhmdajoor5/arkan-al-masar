'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRightLeft,X} from 'lucide-react';
import {api,errorMessage,money,useLocale} from '@/lib/arkan-client';

type Account={category:string;name:string;balance:number};
type Result={id:string;fromEntryId:string;toEntryId:string};
type Props={accounts:Account[];initial?:Account;categoryName:(category:string)=>string;onClose:()=>void;onComplete:(result:Result,source:Account,receipt:File|null)=>Promise<void>};
const key=(account:Account)=>JSON.stringify([account.category,account.name]);
export default function LedgerTransfer({accounts,initial,categoryName,onClose,onComplete}:Props){
 const {en,t}=useLocale(),dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false),requestId=useRef('');
 const [from,setFrom]=useState(initial?key(initial):''),[to,setTo]=useState(''),[amount,setAmount]=useState(''),[entryDate,setEntryDate]=useState(new Date(Date.now()+10800000).toISOString().slice(0,10)),[statement,setStatement]=useState(''),[receipt,setReceipt]=useState<File|null>(null),[busy,setBusy]=useState(false),[attempted,setAttempted]=useState(false),[error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close()},[]);
 const source=accounts.find(a=>key(a)===from),destination=accounts.find(a=>key(a)===to),halalas=Math.round(Number(amount)*100),validAmount=/^\d+(\.\d{1,2})?$/.test(amount)&&halalas>0&&halalas<=100000000000;
 async function submit(event:React.FormEvent){
  event.preventDefault();if(inFlight.current)return;
  if(!source||!destination||from===to||!validAmount){setError(t('اختر حسابين مختلفين ومبلغًا صحيحًا أكبر من صفر.','Choose two different accounts and a valid positive amount.'));return}
  if(!statement.trim()){setError(t('أدخل بيان التحويل.','Enter a transfer statement.'));return}
  if(!requestId.current)requestId.current=crypto.randomUUID();
  inFlight.current=true;setBusy(true);setAttempted(true);setError('');
  try{const result=await api('createLedgerTransfer',{id:requestId.current,data:{from:{category:source.category,name:source.name},to:{category:destination.category,name:destination.name},amount:halalas,entryDate,statement:statement.trim()}});await onComplete(result,source,receipt)}
  catch(e:any){const code=e.message;setError(code==='LEDGER_TRANSFER_CHANGED'?t('تم تسجيل طلب مختلف بهذا المرجع. حدّث الحسابات للتحقق.','A different request used this reference. Refresh accounts to check.'):code==='LEDGER_ACCOUNT_NOT_FOUND'?t('أحد الحسابات لم يعد متاحًا. أغلق النافذة وحدّث القائمة.','An account is no longer available. Close and refresh.'):errorMessage(e,en))}
  finally{inFlight.current=false;setBusy(false)}
 }
 return <dialog ref={dialog} className="ledger-transfer-dialog" onCancel={event=>{event.preventDefault();if(!busy)onClose()}} aria-labelledby="transfer-title"><div className="section-heading"><div><h2 id="transfer-title"><ArrowRightLeft size={22}/> {t('تحويل بين الحسابات','Transfer between accounts')}</h2><p>{t('تحويل محاسبي داخلي بالريال السعودي','Internal accounting transfer in SAR')}</p></div><button type="button" className="icon-button" disabled={busy} aria-label={t('إغلاق','Close')} onClick={onClose}><X size={20}/></button></div><form className="accounting-form ledger-transfer-form" onSubmit={submit}><fieldset disabled={busy||attempted}>
 <label>{t('من حساب','From account')}<select required value={from} onChange={e=>setFrom(e.target.value)}><option value="">{t('اختر الحساب','Choose account')}</option>{accounts.map(a=><option key={key(a)} value={key(a)} disabled={key(a)===to}>{a.name} — {categoryName(a.category)}</option>)}</select></label>
 <label>{t('إلى حساب','To account')}<select required value={to} onChange={e=>setTo(e.target.value)}><option value="">{t('اختر الحساب','Choose account')}</option>{accounts.map(a=><option key={key(a)} value={key(a)} disabled={key(a)===from}>{a.name} — {categoryName(a.category)}</option>)}</select></label>
 <label>{t('المبلغ (ر.س)','Amount (SAR)')}<input required type="number" inputMode="decimal" min="0.01" max="1000000000" step="0.01" dir="ltr" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
 <label>{t('التاريخ','Date')}<input required type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)}/></label>
 <label className="accounting-description">{t('البيان','Statement')}<input required maxLength={180} value={statement} onChange={e=>setStatement(e.target.value)}/></label>
 <label className="accounting-description">{t('صورة السند (اختياري)','Receipt image (optional)')}<input type="file" accept="image/*" onChange={e=>setReceipt(e.target.files?.[0]||null)}/></label>
 </fieldset>{source&&destination&&validAmount&&<div className="transfer-summary"><p><b>{source.name}</b>: {money(source.balance,en)} ← {money(source.balance-halalas,en)}</p><p><b>{destination.name}</b>: {money(destination.balance,en)} ← {money(destination.balance+halalas,en)}</p><small>{t('يُنقص المبلغ من رصيد الحساب الأول ويُضاف إلى الثاني، وفق الرصيد = الدائن − المدين. الأرصدة المعروضة تقديرية حتى الحفظ.','The first balance decreases and the second increases (credit minus debit). Shown balances are estimates until saved.')}</small></div>}{error&&<p role="alert" className="ops-error">{error}</p>}{attempted&&!busy&&error&&<p className="ops-form-note">{t('يمكنك إعادة المحاولة بنفس البيانات؛ لن يتكرر التحويل إذا كان قد حُفظ.','Retry with the same details; a saved transfer will not be duplicated.')}</p>}<div className="accounting-form-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>{t('إلغاء','Cancel')}</button><button className="primary" disabled={busy||accounts.length<2}>{busy?t('جارٍ الحفظ…','Saving…'):attempted?t('إعادة المحاولة','Retry'):t('تأكيد التحويل','Confirm transfer')}</button></div></form></dialog>;
}
