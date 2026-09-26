'use client';
import {useEffect,useRef,useState} from 'react';
import {FileText,Download,ExternalLink,LoaderCircle} from 'lucide-react';
import {api,errorMessage,useLocale} from '@/lib/arkan-client';
export default function InvoiceDownload({code,mobile,asAdmin=false}:{code:string;mobile?:string;asAdmin?:boolean}){
 const{en,t}=useLocale();const[busy,setBusy]=useState(false),[error,setError]=useState('');
 const[result,setResult]=useState<{url:string;number:string}|null>(null);const active=useRef(true),objectURL=useRef('');
 useEffect(()=>{active.current=true;return()=>{active.current=false;if(objectURL.current)URL.revokeObjectURL(objectURL.current)}},[]);
 async function prepare(){if(busy)return;setBusy(true);setError('');try{const data=await api('invoice',{code,mobile,asAdmin});const{invoicePDF}=await import('@/lib/invoice-pdf');const blob=await invoicePDF(data);if(!active.current)return;const url=URL.createObjectURL(blob);if(objectURL.current)URL.revokeObjectURL(objectURL.current);objectURL.current=url;setResult({url,number:'AM-INV-'+String(data.invoice.sequence).padStart(8,'0')})}catch(e){if(active.current)setError(errorMessage(e,en))}finally{if(active.current)setBusy(false)}}
 return <div className="summary-download" aria-busy={busy}>
 <button className="secondary" type="button" disabled={busy} onClick={()=>void prepare()}>{busy?<LoaderCircle size={18} className="animate-spin"/>:<FileText size={18}/ >}{busy?t('جارٍ تجهيز الفاتورة…','Preparing invoice…'):result?t('تحديث حالة الدفع في النسخة','Refresh payment status'):t('عرض الفاتورة','View invoice')}</button>
 {result&&<><a className="primary" href={result.url} download={result.number+'.pdf'} target="_blank" rel="noopener noreferrer"><Download size={18}/>{t('تحميل الفاتورة PDF','Download invoice PDF')}</a><a className="text-button" href={result.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17}/>{t('فتح للطباعة','Open to print')}</a></>}
 {error&&<p className="error" role="alert">{error}</p>}
 </div>
}
