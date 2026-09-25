'use client';
import {useEffect,useState} from 'react';
import {Ticket,Check,MessageCircle,CalendarDays} from 'lucide-react';
import {api,errorMessage,money,useLocale} from '@/lib/arkan-client';
import type {TravelPackage} from '@/lib/travel-packages';
export function PackageCard({item,phone}:{item:TravelPackage;phone:string}){
 const{en,t}=useLocale();const pick=(ar:string,english:string)=>en&&english?english:ar;
 const name=pick(item.ar,item.en),features=pick(item.benefitsAr,item.benefitsEn).split('\n').filter(Boolean);
 return <article className={'package-card '+(item.featured?'featured':'')}>
 <img src={item.image||'/coach-cutout.webp'} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src='/coach-cutout.webp'}}/>
 <div className="package-content"><span className="tag">{item.type==='rides'?t('باقة رحلات','Ride bundle'):t('عرض رحلة','Travel offer')}</span><h2>{name}</h2><p className="package-copy">{pick(item.descriptionAr,item.descriptionEn)}</p>
 <strong className="package-price">{money(Math.round(item.price*100),en)}</strong><div className="package-facts"><span><Ticket size={17}/>{item.tripCount} {t('رحلات / اتجاهات','rides / legs')}</span><span><CalendarDays size={17}/>{t('صلاحية ','Valid for ')}{item.validDays} {t('يومًا من التفعيل','days after activation')}</span></div>
 {features.length>0&&<ul>{features.map((f,i)=><li key={i}><Check size={17}/>{f}</li>)}</ul>}
 {(item.start||item.end)&&<p className="micro">{t('فترة العرض: ','Offer period: ')}<bdi>{item.start||'—'} — {item.end||'—'}</bdi></p>}
 {pick(item.termsAr,item.termsEn)&&<details><summary>{t('شروط الباقة','Package terms')}</summary><p className="package-copy">{pick(item.termsAr,item.termsEn)}</p></details>}
 {phone?<a className="primary wide" href={'https://wa.me/'+phone+'?text='+encodeURIComponent(t('مرحبًا، أود الاستفسار عن باقة ','Hello, I would like to enquire about ')+name+' ('+item.id+') — '+money(Math.round(item.price*100),en))} target="_blank" rel="noopener noreferrer"><MessageCircle size={19}/>{t('اطلب الباقة عبر واتساب','Enquire on WhatsApp')}</a>:<a className="secondary wide" href="/contact">{t('تواصل لطلب الباقة','Contact us about this package')}</a>}
 <small>{t('طلب الباقة لا يؤكد الحجز أو يحجز مقعدًا. تؤكد الإدارة المواعيد والتوفر وطريقة الدفع.','An enquiry does not confirm a booking or reserve a seat. Our team confirms dates, availability and payment.')}</small>
 </div></article>
}
export default function PackagesPage(){const{en,t}=useLocale();const[data,setData]=useState<any>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);useEffect(()=>{let live=true;setError('');api('packages').then(d=>{if(live)setData(d)}).catch(e=>{if(live)setError(errorMessage(e,en))});return()=>{live=false}},[retry,en]);return <main className="container flow packages-page"><div className="page-heading"><div><h1>{t('باقات أركان المسار','Arkan Al-Masar packages')}</h1><p>{t('اختر الباقة المناسبة لتنقّلاتك','Find a package for your journeys')}</p></div><Ticket size={30}/></div>{error?<div className="panel" role="alert"><p>{error}</p><button className="secondary" onClick={()=>setRetry(n=>n+1)}>{t('إعادة المحاولة','Try again')}</button></div>:!data?<p role="status">{t('جارٍ تحميل الباقات…','Loading packages…')}</p>:data.packages.length?<div className="packages-grid">{data.packages.map((p:TravelPackage)=><PackageCard key={p.id} item={p} phone={data.whatsapp}/>)}</div>:<div className="panel empty"><Ticket/><h2>{t('لا توجد باقات متاحة حاليًا','No packages available right now')}</h2><a className="primary" href="/">{t('احجز رحلة','Book a trip')}</a></div>}</main>}
