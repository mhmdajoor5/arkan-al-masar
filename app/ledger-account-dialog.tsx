'use client';
import {useEffect,useRef,useState} from 'react';
import {Edit3,Trash2,RotateCcw,X} from 'lucide-react';
import {api,errorMessage,money,useLocale} from '@/lib/arkan-client';

export type LedgerAccount={category:string;name:string;displayName?:string;archived?:number;revision?:number;balance:number;count:number};
export type AccountOperation='rename'|'archive'|'restore';
type Props={account:LedgerAccount;operation:AccountOperation;onClose:()=>void;onSaved:()=>Promise<void>};
export default function LedgerAccountDialog({account,operation,onClose,onSaved}:Props){
 const{en,t}=useLocale(),dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false),requestId=useRef('');
 const[name,setName]=useState(account.displayName||account.name),[busy,setBusy]=useState(false),[attempted,setAttempted]=useState(false),[error,setError]=useState('');
 const title=operation==='rename'?t('تعديل الحساب','Edit account'):operation==='archive'?t('حذف الحساب','Delete account'):t('استرجاع الحساب','Restore account');
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close()},[]);
 async function submit(event:React.FormEvent){
  event.preventDefault();if(inFlight.current)return;
  if(!name.trim()){setError(t('أدخل اسم الحساب.','Enter the account name.'));return}
  if(!requestId.current)requestId.current=crypto.randomUUID();
  inFlight.current=true;setBusy(true);setAttempted(true);setError('');
  try{
   const op=operation==='rename'?'renameLedgerAccount':operation==='archive'?'archiveLedgerAccount':'restoreLedgerAccount';
   await api(op,{account:{category:account.category,name:account.name},name:name.trim(),expectedRevision:account.revision||0,requestId:requestId.current});
   await onSaved();
  }catch(e:any){const messages:Record<string,[string,string]>={LEDGER_ACCOUNT_CHANGED:['تغيّر الحساب. أغلق النافذة وحدّث القائمة ثم حاول مجددًا.','Account changed. Close and refresh the list before trying again.'],LEDGER_ACCOUNT_NAME_EXISTS:['يوجد حساب بهذا الاسم في القسم نفسه. أغلق النافذة واختر اسمًا مختلفًا.','An account in this category already uses that name. Close and choose another name.'],LEDGER_ACCOUNT_NOT_FOUND:['لم يعد الحساب متاحًا. حدّث القائمة.','Account unavailable. Refresh the list.']};setError(messages[e.message]?.[en?1:0]||errorMessage(e,en))}
  finally{inFlight.current=false;setBusy(false)}
 }
 const Icon=operation==='rename'?Edit3:operation==='archive'?Trash2:RotateCcw;
 return <dialog ref={dialog} className="ledger-transfer-dialog ledger-account-dialog" aria-labelledby="account-dialog-title" onCancel={event=>{event.preventDefault();if(!busy)onClose()}}>
  <div className="section-heading"><h2 id="account-dialog-title"><Icon size={22}/>{title}</h2><button type="button" className="icon-button" aria-label={t('إغلاق','Close')} disabled={busy} onClick={onClose}><X size={20}/></button></div>
  <form className="accounting-form ledger-account-form" onSubmit={submit}>
   {operation==='rename'?<label>{t('اسم الحساب','Account name')}<input autoFocus required maxLength={140} value={name} disabled={busy||attempted} onChange={event=>setName(event.target.value)}/></label>:<p><b>{name}</b></p>}
   <p>{account.count} {t('حركة','entries')} · {t('الرصيد: ','Balance: ')}<b className={account.balance<0?'ledger-debit':'ledger-credit'}>{money(account.balance,en)}</b></p>
   <p className="ops-form-note">{operation==='archive'?t('سيُنقل الحساب إلى «الحسابات المحذوفة» ويتوقف استخدامه في الحركات الجديدة. ستبقى الحركات والمرفقات والرصيد محفوظة، ويمكن استرجاعه في أي وقت.','The account moves to Deleted accounts and cannot be used for new entries. Its transactions, receipts and balance are retained, and it can be restored at any time.'):operation==='restore'?t('سيعود الحساب إلى القائمة، ويمكن استخدامه مجددًا.','The account returns to the active list and can be used again.'):t('يظهر الاسم الجديد في الحسابات والكشوف والتحويلات مع بقاء الرصيد والحركات كما هي.','The new name appears in accounts, statements and transfers. Balances and transactions stay the same.')}</p>
   {error&&<p role="alert" className="ops-error">{error}</p>}
   <div className="accounting-form-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>{t('إلغاء','Cancel')}</button><button className={operation==='archive'?'secondary ops-danger':'primary'} disabled={busy}>{busy?t('جارٍ الحفظ…','Saving…'):attempted?t('إعادة المحاولة','Retry'):operation==='rename'?t('حفظ التعديل','Save changes'):operation==='archive'?t('تأكيد حذف الحساب','Confirm deletion'):t('استرجاع الحساب','Restore account')}</button></div>
  </form>
 </dialog>;
}
