'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRightLeft,X} from 'lucide-react';
import {api,errorMessage,money,useLocale} from '@/lib/arkan-client';

type Account={category:string;name:string;balance:number};
export type Transfer={id:string;revision:number;status:'active'|'cancelled';from:Pick<Account,'category'|'name'>;to:Pick<Account,'category'|'name'>;amount:number;entryDate:string;statement:string;cancelReason?:string;cancelDate?:string};
type Result={id:string;fromEntryId:string;toEntryId:string;status?:string};
type Props={accounts:Account[];initial?:Account;transfer?:Transfer;cancel?:boolean;categoryName:(category:string)=>string;onClose:()=>void;onComplete:(result:Result,source:Account,receipt:File|null)=>Promise<void>};
const key=(account:Pick<Account,'category'|'name'>)=>JSON.stringify([account.category,account.name]);

export default function LedgerTransfer({accounts,initial,transfer,cancel=false,categoryName,onClose,onComplete}:Props){
 const {en,t}=useLocale(),dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false),requestId=useRef('');
 const [from,setFrom]=useState(transfer?key(transfer.from):initial?key(initial):'');
 const [to,setTo]=useState(transfer?key(transfer.to):'');
 const [amount,setAmount]=useState(transfer?String(transfer.amount/100):'');
 const today=new Date(Date.now()+10800000).toISOString().slice(0,10);
 const [entryDate,setEntryDate]=useState(!cancel&&transfer?transfer.entryDate:cancel&&transfer&&transfer.entryDate>today?transfer.entryDate:today);
 const [statement,setStatement]=useState(transfer?.statement||''),[reason,setReason]=useState('');
 const [receipt,setReceipt]=useState<File|null>(null),[busy,setBusy]=useState(false),[attempted,setAttempted]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close()},[]);
 const source=accounts.find(a=>key(a)===from),destination=accounts.find(a=>key(a)===to);
 const halalas=Math.round(Number(amount)*100),validAmount=/^\d+(\.\d{1,2})?$/.test(amount)&&halalas>0&&halalas<=100000000000;
 const title=cancel?t('إلغاء التحويل','Cancel transfer'):transfer?t('تعديل التحويل','Edit transfer'):t('تحويل بين الحسابات','Transfer between accounts');
 // Remove the original effect before showing the projected balance for an edit.
 const affectedAccounts=accounts.filter(a=>[from,to,...(transfer?[key(transfer.from),key(transfer.to)]:[])].includes(key(a)));
 const projectedBalance=(account:Account)=>{
  const accountKey=key(account);let value=account.balance;
  if(transfer){if(accountKey===key(transfer.from))value+=transfer.amount;if(accountKey===key(transfer.to))value-=transfer.amount}
  if(!cancel){if(accountKey===from)value-=halalas;if(accountKey===to)value+=halalas}
  return value;
 };
 async function submit(event:React.FormEvent){
  event.preventDefault();if(inFlight.current)return;
  if(!source||!destination||from===to||!validAmount){setError(t('اختر حسابين مختلفين ومبلغًا صحيحًا أكبر من صفر.','Choose two different accounts and a valid positive amount.'));return}
  if(cancel&&!reason.trim()){setError(t('أدخل سبب إلغاء التحويل.','Enter a cancellation reason.'));return}
  if(!cancel&&!statement.trim()){setError(t('أدخل بيان التحويل.','Enter a transfer statement.'));return}
  if(receipt){const pdf=receipt.type==='application/pdf'||/\.pdf$/i.test(receipt.name);if(!receipt.size||receipt.size>(pdf?1000000:25000000)){setError(t('اختر PDF حتى ١ ميجابايت أو صورة حتى ٢٥ ميجابايت.','Choose a PDF up to 1 MB or an image up to 25 MB.'));return}}
  if(!requestId.current)requestId.current=crypto.randomUUID();
  inFlight.current=true;setBusy(true);setAttempted(true);setError('');
  try{
   const operation=cancel?'cancelLedgerTransfer':transfer?'updateLedgerTransfer':'createLedgerTransfer';
   const data=cancel?{entryDate,reason:reason.trim()}:{from:{category:source.category,name:source.name},to:{category:destination.category,name:destination.name},amount:halalas,entryDate,statement:statement.trim()};
   const result=await api(operation,{id:transfer?.id||requestId.current,...(transfer?{requestId:requestId.current,expectedRevision:transfer.revision}:{}),data});
   await onComplete(result,source,receipt);
  }catch(e:any){
   const messages:Record<string,[string,string]>={
    LEDGER_TRANSFER_CHANGED:['تغيّر التحويل أو أحد الحسابات. أغلق النافذة وحدّث الحسابات قبل المحاولة.','The transfer or an account changed. Close and refresh accounts before retrying.'],
    LEDGER_TRANSFER_CANCELLED:['تم إلغاء هذا التحويل بالفعل. أغلق النافذة وحدّث الحسابات.','This transfer was already cancelled. Close and refresh accounts.'],
    LEDGER_TRANSFER_NOT_FOUND:['لم يعد التحويل متاحًا. أغلق النافذة وحدّث الحسابات.','Transfer unavailable. Close and refresh accounts.'],
    LEDGER_ACCOUNT_NOT_FOUND:['أحد الحسابات لم يعد متاحًا. أغلق النافذة وحدّث القائمة.','An account is no longer available. Close and refresh.']
   };
   const message=messages[e.message];setError(message?message[en?1:0]:errorMessage(e,en));
  }finally{inFlight.current=false;setBusy(false)}
 }
 return <dialog ref={dialog} className="ledger-transfer-dialog" onCancel={event=>{event.preventDefault();if(!busy)onClose()}} aria-labelledby="transfer-title">
  <div className="section-heading"><div><h2 id="transfer-title"><ArrowRightLeft size={22}/>{title}</h2><p>{transfer?t('يُطبّق الإجراء على الحسابين معًا، ويُحفظ سجل التغيير.','Changes apply to both accounts together and are recorded.'):t('تحويل محاسبي داخلي بالريال السعودي','Internal accounting transfer in SAR')}</p></div><button type="button" className="icon-button" disabled={busy} aria-label={t('إغلاق','Close')} onClick={onClose}><X size={20}/></button></div>
  <form className="accounting-form ledger-transfer-form" onSubmit={submit}><fieldset disabled={busy||attempted}>
   {cancel&&transfer?<div className="accounting-description"><p><b>{t('من: ','From: ')}{transfer.from.name}</b></p><p><b>{t('إلى: ','To: ')}{transfer.to.name}</b></p><p>{money(transfer.amount,en)} · {transfer.entryDate}</p><p>{transfer.statement}</p><p>{t('سيُسجّل قيد عكسي يعيد أثر التحويل على الحسابين. سيبقى التحويل ومرفقاته محفوظين، ولا يمكن تعديل التحويل بعد إلغائه.','Reversal entries will undo the transfer in both accounts. The transfer and receipts remain on record; a cancelled transfer cannot be edited.')}</p></div>:<>
    <label>{t('من حساب','From account')}<select required value={from} onChange={e=>setFrom(e.target.value)}><option value="">{t('اختر الحساب','Choose account')}</option>{accounts.map(a=><option key={key(a)} value={key(a)} disabled={key(a)===to}>{a.name} — {categoryName(a.category)}</option>)}</select></label>
    <label>{t('إلى حساب','To account')}<select required value={to} onChange={e=>setTo(e.target.value)}><option value="">{t('اختر الحساب','Choose account')}</option>{accounts.map(a=><option key={key(a)} value={key(a)} disabled={key(a)===from}>{a.name} — {categoryName(a.category)}</option>)}</select></label>
    <label>{t('المبلغ (ر.س)','Amount (SAR)')}<input required type="number" inputMode="decimal" min="0.01" max="1000000000" step="0.01" dir="ltr" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
   </>}
   <label>{cancel?t('تاريخ الإلغاء','Cancellation date'):t('التاريخ','Date')}<input required type="date" min={cancel?transfer?.entryDate:undefined} value={entryDate} onChange={e=>setEntryDate(e.target.value)}/></label>
   {cancel?<label className="accounting-description">{t('سبب الإلغاء','Cancellation reason')}<input required maxLength={140} value={reason} onChange={e=>setReason(e.target.value)}/></label>:<>
    {source&&destination&&<label className="accounting-description">{t('الوصف التلقائي','Automatic description')}<input readOnly value={t('تحويل من '+source.name+' إلى '+destination.name,'Transfer from '+source.name+' to '+destination.name)}/></label>}
    <label className="accounting-description">{t('البيان','Statement')}<input required maxLength={180} value={statement} onChange={e=>setStatement(e.target.value)}/></label>
    <label className="accounting-description">{t('صورة أو ملف PDF للسند (اختياري)','Receipt image or PDF (optional)')}<input type="file" accept="image/*,application/pdf,.pdf" onChange={e=>setReceipt(e.target.files?.[0]||null)}/></label>
   </>}
  </fieldset>
  {source&&destination&&validAmount&&<div className="transfer-summary">{affectedAccounts.map(account=><p key={key(account)}><b>{account.name}</b>: <span>{money(account.balance,en)}</span> ← <b>{money(projectedBalance(account),en)}</b></p>)}<small>{t('الرصيد الحالي ← الرصيد بعد الحفظ. القيم تقديرية حتى الحفظ.','Current balance → balance after saving. Values are estimates until saved.')}</small></div>}
  {error&&<p role="alert" className="ops-error">{error}</p>}
  {attempted&&!busy&&error&&<p className="ops-form-note">{t('إعادة المحاولة بنفس البيانات لا تكرر العملية. إذا تغيّر التحويل، أغلق النافذة وافتحه من جديد.','Retrying the same details will not repeat the operation. If the transfer changed, close and reopen it.')}</p>}
  <div className="accounting-form-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>{t('إغلاق','Close')}</button><button className="primary" disabled={busy||accounts.length<2}>{busy?t('جارٍ الحفظ…','Saving…'):attempted?t('إعادة المحاولة','Retry'):cancel?t('تأكيد إلغاء التحويل','Confirm cancellation'):transfer?t('حفظ تعديل الحسابين','Save both accounts'):t('تأكيد التحويل','Confirm transfer')}</button></div>
  </form>
 </dialog>;
}
