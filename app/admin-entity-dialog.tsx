'use client';
import {busTypes,busLabel} from '@/lib/bus-types';
import {useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Checkbox} from '@/components/ui/checkbox';
import {Choice,errorMessage,useLocale} from '@/lib/arkan-client';

export default function EntityDialog({entry,data,date,onClose,onSave}:{entry:any;data:any;date:string;onClose:()=>void;onSave:(kind:string,id:string|undefined,form:any)=>Promise<void>}){
  const {en,t}=useLocale();
  const stations=data.entities.filter((x:any)=>x.kind==='station'&&(x.active||[entry.item?.from,entry.item?.to,entry.item?.from_station,entry.item?.to_station].includes(x.id))),buses=data.entities.filter((x:any)=>x.kind==='bus'&&(x.active!==false||x.id===entry.item?.bus)),drivers=data.entities.filter((x:any)=>x.kind==='driver');
  const from=stations[0],to=stations.find((s:any)=>s.city!==from?.city);
  const nextMonth=new Date(Date.parse(date+'T12:00:00+03:00')+30*86400000).toISOString().slice(0,10);
  const defaults:any={trips:{date,time:'07:30',from:from?.id||'',to:to?.id||'',bus:buses[0]?.id||'',driver:''},station:{ar:'',en:'',city:'jeddah',active:true},bus:{plate:'',name:'حافلة ٤٩ مقعدًا',seats:49,active:true},driver:{name:'',nationalId:'',mobile:''},schedule:{from:from?.id||'',to:to?.id||'',time:'07:30',bus:buses[0]?.id||'',driver:'',start:date,end:nextMonth,active:true}};
  const [form,setForm]=useState<any>(()=>entry.item?(entry.kind==='trips'?{date:entry.item.date,time:entry.item.time,from:entry.item.from_station,to:entry.item.to_station,bus:entry.item.bus,driver:entry.item.driver}:entry.item):defaults[entry.kind]);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const labels:any={trips:t('رحلة','trip'),station:t('محطة','station'),bus:t('حافلة','bus'),driver:t('سائق','driver'),schedule:t('جدول يومي','daily schedule')};
  const label=(s:any)=>s[en?'en':'ar'];
  function change(key:string,value:any){setForm((old:any)=>{const next={...old,[key]:value};if(key==='from'&&stations.find((s:any)=>s.id===old.to)?.city===stations.find((s:any)=>s.id===value)?.city)next.to=stations.find((s:any)=>s.city!==stations.find((x:any)=>x.id===value)?.city)?.id||'';return next})}
  function field(key:string,title:string,type='text',options?:any[]){return <label key={key}>{title}{options?<Choice value={form[key]||'none'} onChange={v=>change(key,v==='none'?'':v)} label={title} options={options.length?options:[{value:'none',label:t('لا توجد خيارات متاحة','No options available')}]}/>:<input type={type} required value={form[key]??''} dir={['nationalId','mobile','time','date','start','end'].includes(key)?'ltr':undefined} maxLength={key==='nationalId'?10:180} inputMode={key==='nationalId'?'numeric':undefined} pattern={key==='nationalId'?'[0-9]{10}':key==='mobile'?'(05[0-9]{8}|\\+?9665[0-9]{8})':undefined} min={key==='end'?form.start:undefined} onChange={e=>change(key,e.target.value)}/>}</label>}
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose()}}><DialogContent className="entity-dialog ops-dialog" dir={en?'ltr':'rtl'}><DialogHeader><DialogTitle>{entry.item?t('تعديل ','Edit '):t('إضافة ','Add ')}{labels[entry.kind]}</DialogTitle><DialogDescription>{entry.kind==='schedule'?t('أنشئ رحلة يومية خلال الفترة المحددة.','Create a daily departure for the selected date range.'):t('أكمل البيانات ثم احفظ التغييرات.','Complete the details and save your changes.')}</DialogDescription></DialogHeader>
    <form onSubmit={async e=>{e.preventDefault();setError('');setBusy(true);try{if(['trips','schedule'].includes(entry.kind)&&(!form.from||!form.to||!form.bus))throw new Error('INVALID_ROUTE');await onSave(entry.kind,entry.item?.id,form);onClose()}catch(e){setError(errorMessage(e,en))}finally{setBusy(false)}}}>
      <div className="form-grid">
      {entry.kind==='station'?<>{field('ar',t('اسم المحطة بالعربية','Arabic station name'))}{field('en',t('اسم المحطة بالإنجليزية','English station name'))}{field('city',t('المدينة','City'),'text',[{value:'jeddah',label:t('جدة','Jeddah')},{value:'makkah',label:t('مكة المكرمة','Makkah')}])}</>:entry.kind==='bus'?<>{field('plate',t('رقم اللوحة','Plate number'))}{field('name',t('اسم الحافلة','Bus name'))}<label>{t('نوع الحافلة وسعتها','Bus type & capacity')}<Choice label={t('نوع الحافلة وسعتها','Bus type & capacity')} value={String(form.seats)} onChange={v=>{const type=busTypes.find(b=>b.seats===Number(v))!;setForm({...form,seats:type.seats,name:!form.name||busTypes.some(b=>b.ar===form.name)?type.ar:form.name})}} options={busTypes.map(b=>({value:String(b.seats),label:b[en?'en':'ar']+' — '+b.seats}))}/></label><p className="ops-form-note">{t('إيقاف الحافلة يغلق الحجز الجديد عليها، ولا يلغي الحجوزات الحالية. تغيير السعة غير متاح مع وجود حجوزات مسجلة أو حجز مؤقت.','Disabling closes new bookings without cancelling existing bookings. Capacity cannot change while recorded bookings or holds exist.')}</p></>:entry.kind==='driver'?<>{field('name',t('اسم السائق','Driver name'))}{field('nationalId',t('رقم الهوية / الإقامة','National ID / Iqama'))}{field('mobile',t('رقم الجوال','Mobile number'),'tel')}</>:<>
      {entry.kind==='trips'?field('date',t('تاريخ الرحلة','Trip date'),'date'):<>{field('start',t('بداية الجدول','Start date'),'date')}{field('end',t('نهاية الجدول','End date'),'date')}</>}
      {field('time',t('وقت المغادرة — السعودية','Departure — Saudi time'),'time')}
      {field('from',t('محطة المغادرة','Departure station'),'text',stations.map((s:any)=>({value:s.id,label:label(s)})))}
      {field('to',t('محطة الوصول','Arrival station'),'text',stations.filter((s:any)=>s.city!==stations.find((x:any)=>x.id===form.from)?.city).map((s:any)=>({value:s.id,label:label(s)})))}
      {field('bus',t('الحافلة','Bus'),'text',buses.map((b:any)=>({value:b.id,label:busLabel(b,en)+' — '+b.seats+(b.active===false?t(' (متوقفة)',' (disabled)'):'')})))}
      {field('driver',t('السائق','Driver'),'text',[{value:'none',label:t('يُعيّن لاحقًا','Assign later')},...drivers.map((d:any)=>({value:d.id,label:d.name}))])}
      </>}
      </div>
      {['station','schedule','bus'].includes(entry.kind)&&<label className="accept"><Checkbox checked={!!form.active} onCheckedChange={v=>change('active',v===true)}/>{t('مفعّل','Active')}</label>}
      {entry.kind==='schedule'&&entry.item&&<p className="ops-form-note">{t('التعديل يطبّق على الرحلات التي لم تُنشأ بعد. عدّل الرحلات الموجودة من قسم الرحلات.','Changes apply to trips not yet generated. Edit existing departures in Trips.')}</p>}
      {error&&<p className="error" role="alert">{error}</p>}
      <div className="ops-dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>{t('رجوع','Back')}</button><button className="primary" disabled={busy}>{busy?t('جارٍ الحفظ…','Saving…'):t('حفظ البيانات','Save details')}</button></div>
    </form>
  </DialogContent></Dialog>;
}
