'use client';
import {useState} from 'react';
import {Plus,Edit3,Trash2,Star} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Checkbox} from '@/components/ui/checkbox';
import {cityName,errorMessage,money,useLocale} from '@/lib/arkan-client';
import type {Hotel} from '@/lib/hotels';
import GridTable from './admin-grid-table';

const blank={ar:'',en:'',city:'',address:'',phone:'',stars:0,roomTypes:[],notes:'',active:true};
const newRoom=()=>({id:crypto.randomUUID(),name:'',capacity:2,price:0});

export default function AdminHotels({items,packages,onSave,onDelete}:{items:Hotel[];packages:any[];onSave:(id:string|undefined,data:any)=>Promise<void>;onDelete:(hotel:Hotel)=>void}){
 const{en,t}=useLocale();const[edit,setEdit]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const change=(key:string,value:any)=>setEdit((current:any)=>({...current,[key]:value}));
 const rooms=(value:any[])=>change('roomTypes',value);
 const used=(h:Hotel)=>packages.filter(p=>p.hotelId===h.id).length;
 const rows=[...items].sort((a,b)=>a.ar.localeCompare(b.ar,'ar')).map(h=>[
  <div key="name"><b>{en&&h.en?h.en:h.ar}</b><small>{en?h.ar:h.en}</small>{h.stars>0&&<small className="hotel-stars" aria-label={h.stars+' '+t('نجوم','stars')}>{Array.from({length:h.stars},(_,i)=><Star key={i} size={12} fill="currentColor"/>)}</small>}</div>,
  <div key="city">{cityName(h.city,en)==='—'?h.city:cityName(h.city,en)}{h.phone&&<small dir="ltr">{h.phone}</small>}</div>,
  <div key="rooms">{h.roomTypes.length?h.roomTypes.map(r=><small key={r.id}>{r.name} · {r.capacity} {t('أشخاص','guests')} · {money(Math.round(r.price*100),en)}</small>):<small>{t('لا توجد غرف بعد','No room types yet')}</small>}</div>,
  <span key="status" className={'ops-status '+(h.active?'active':'departed')}>{h.active?t('نشط','Active'):t('متوقف','Inactive')}{used(h)>0&&<small>{used(h)} {t('باقة','packages')}</small>}</span>,
  <div className="row-actions" key="actions"><button className="icon-button" aria-label={t('تعديل','Edit')} title={t('تعديل','Edit')} onClick={()=>{setEdit({...blank,...h});setError('')}}><Edit3 size={18}/></button><button className="icon-button ops-danger" aria-label={t('حذف الفندق','Delete hotel')} title={t('حذف الفندق','Delete hotel')} onClick={()=>onDelete(h)}><Trash2 size={18}/></button></div>
 ]);
 return <section className="panel admin-table"><div className="section-heading"><div><h2>{t('الفنادق','Hotels')}</h2><p>{items.length} {t('سجل','records')}</p></div><button className="primary" onClick={()=>{setEdit({...blank,roomTypes:[newRoom()]});setError('')}}><Plus size={18}/>{t('إضافة فندق','Add hotel')}</button></div>
  <p className="ops-form-note">{t('الفنادق المسجلة هنا تظهر كخيارات عند إعداد الباقات. إيقاف الفندق يخفيه من الخيارات دون تغيير الباقات الحالية.','Hotels listed here appear as options when setting up packages. Deactivating a hotel hides it from the options without changing existing packages.')}</p>
  <GridTable headers={[t('الفندق','Hotel'),t('المدينة','City'),t('أنواع الغرف','Room types'),t('الحالة','Status'),t('إجراءات','Actions')]} rows={rows} empty={t('لا توجد فنادق بعد. أضف أول فندق للبدء.','No hotels yet. Add the first one to get started.')}/>
  {edit&&<Dialog open onOpenChange={open=>{if(!open&&!busy)setEdit(null)}}><DialogContent className="ops-dialog package-dialog" dir={en?'ltr':'rtl'}><DialogHeader><DialogTitle>{edit.id?t('تعديل الفندق','Edit hotel'):t('إضافة فندق','Add hotel')}</DialogTitle><DialogDescription>{t('أدخل بيانات الفندق وأنواع الغرف وأسعارها لكامل الإقامة.','Enter the hotel details, room types and their price for the whole stay.')}</DialogDescription></DialogHeader>
   <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const{id,...data}=edit;await onSave(id,{...data,phone:data.phone.replace(/[\s-]/g,''),roomTypes:data.roomTypes.filter((r:any)=>r.name.trim())});setEdit(null)}catch(e){setError(errorMessage(e,en))}finally{setBusy(false)}}}>
    <div className="form-grid">
     <label>{t('اسم الفندق بالعربية *','Arabic hotel name *')}<input required minLength={2} maxLength={180} value={edit.ar} onChange={e=>change('ar',e.target.value)}/></label>
     <label>{t('اسم الفندق بالإنجليزية','English hotel name')}<input maxLength={180} dir="ltr" value={edit.en} onChange={e=>change('en',e.target.value)}/></label>
     <label>{t('المدينة *','City *')}<input required minLength={2} maxLength={80} value={edit.city} onChange={e=>change('city',e.target.value)} placeholder={t('مثال: مكة المكرمة','e.g. Makkah')}/></label>
     <label>{t('التصنيف (نجوم)','Rating (stars)')}<input type="number" min={0} max={5} step={1} value={edit.stars} onChange={e=>change('stars',e.target.value===''?0:Number(e.target.value))}/></label>
     <label>{t('العنوان','Address')}<input maxLength={300} value={edit.address} onChange={e=>change('address',e.target.value)}/></label>
     <label>{t('هاتف الفندق','Hotel phone')}<input type="tel" dir="ltr" maxLength={20} pattern="\+?[0-9\s-]{7,20}" value={edit.phone} onChange={e=>change('phone',e.target.value)}/></label>
     <label className="wide">{t('ملاحظات داخلية','Internal notes')}<textarea maxLength={1000} value={edit.notes} onChange={e=>change('notes',e.target.value)}/></label>
    </div>
    <section className="package-departures"><h3>{t('أنواع الغرف','Room types')}</h3>{edit.roomTypes.map((r:any,i:number)=><div className="passenger-card" key={r.id}><div className="form-grid">
     <label>{t('نوع الغرفة','Room type')}<input required maxLength={120} value={r.name} placeholder={t('مثال: غرفة ثنائية','e.g. Double room')} onChange={e=>rooms(edit.roomTypes.map((x:any,n:number)=>n===i?{...x,name:e.target.value}:x))}/></label>
     <label>{t('أقصى عدد أشخاص','Max guests')}<input type="number" required min={1} max={8} value={r.capacity} onChange={e=>rooms(edit.roomTypes.map((x:any,n:number)=>n===i?{...x,capacity:Number(e.target.value)}:x))}/></label>
     <label>{t('السعر لكامل الإقامة — ريال','Price for the stay — SAR')}<input type="number" required min={0} max={100000} step="0.01" value={r.price} onChange={e=>rooms(edit.roomTypes.map((x:any,n:number)=>n===i?{...x,price:e.target.value===''?0:Number(e.target.value)}:x))}/></label>
    </div><button className="text-button" type="button" onClick={()=>rooms(edit.roomTypes.filter((_:any,n:number)=>n!==i))}>{t('إزالة نوع الغرفة','Remove room type')}</button></div>)}<button type="button" className="secondary" disabled={edit.roomTypes.length>=30} onClick={()=>rooms([...edit.roomTypes,newRoom()])}>{t('إضافة نوع غرفة','Add room type')}</button></section>
    <label className="accept"><Checkbox checked={!!edit.active} onCheckedChange={v=>change('active',v===true)}/>{t('مفعّل ويظهر في خيارات الباقات','Active and available for packages')}</label>
    {error&&<p className="error" role="alert">{error}</p>}
    <div className="ops-dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setEdit(null)}>{t('رجوع','Back')}</button><button className="primary" disabled={busy}>{busy?t('جارٍ الحفظ…','Saving…'):t('حفظ الفندق','Save hotel')}</button></div>
   </form></DialogContent></Dialog>}
 </section>;
}
