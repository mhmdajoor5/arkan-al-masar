'use client';

import {useId,useRef,useState} from 'react';
import {Check,Copy} from 'lucide-react';
import {useLocale} from '@/lib/arkan-client';

export default function TicketCode({token}:{token:string}){
  const {t}=useLocale();
  const fieldId=useId(),messageId=useId();
  const field=useRef<HTMLTextAreaElement>(null);
  const [state,setState]=useState<'idle'|'copying'|'copied'|'manual'>('idle');

  async function copy(){
    setState('copying');
    try{
      await navigator.clipboard.writeText(token);
      setState('copied');
    }catch{
      field.current?.focus();
      field.current?.select();
      setState('manual');
    }
  }

  return <div className="ticket-code">
    <div className="ticket-code-heading">
      <label htmlFor={fieldId}>{t('رمز التذكرة للإدخال اليدوي','Ticket code for manual entry')}</label>
      <button type="button" onClick={()=>void copy()} disabled={state==='copying'} aria-label={t('نسخ رمز التذكرة','Copy ticket code')}>
        {state==='copied'?<Check size={18}/>:<Copy size={18}/>}
        {state==='copied'?t('تم النسخ','Copied'):t('نسخ','Copy')}
      </button>
    </div>
    <textarea id={fieldId} ref={field} value={token} readOnly dir="ltr" rows={2} spellCheck={false} autoCapitalize="off" aria-describedby={messageId} onFocus={event=>event.currentTarget.select()}/>
    <p id={messageId} role="status">{state==='manual'?t('حدّد الرمز وانسخه من قائمة جهازك.','Select the code and copy it using your device menu.'):state==='copied'?t('تم نسخ الرمز كاملًا. الصقه في خانة الإدخال اليدوي لدى السائق.','The full code was copied. Paste it into the driver’s manual entry field.'):t('يمكن للسائق استخدام هذا الرمز بدل مسح QR.','The driver can enter this code instead of scanning the QR.')}</p>
  </div>;
}
