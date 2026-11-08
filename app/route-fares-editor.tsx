'use client';
import {Plus,Trash2} from 'lucide-react';
import {cityName,useLocale} from '@/lib/arkan-client';
import {pairKey} from '@/lib/fares';

export type RouteFareDraft={a:string;b:string;one:string|number;round:string|number};

// Returns an Arabic/English problem description, or '' when every row can be saved.
export function routeFaresProblem(rows:RouteFareDraft[],en:boolean){
  const seen=new Set<string>();
  for(const row of rows){
    if(!row.a||!row.b||row.a===row.b)return en?'Choose two different cities for every route fare.':'اختر مدينتين مختلفتين لكل سعر مسار.';
    if(!(Number(row.one)>=0)||!(Number(row.round)>=0)||row.one===''||row.round==='')return en?'Enter both prices for every route.':'أدخل السعرين لكل مسار.';
    const key=pairKey(row.a,row.b);if(seen.has(key))return en?'The same route is listed twice.':'المسار نفسه مكرر مرتين.';seen.add(key);
  }
  return '';
}

export const routeFaresPayload=(rows:RouteFareDraft[])=>rows.map(r=>({a:r.a,b:r.b,one:Number(r.one),round:Number(r.round)}));

export default function RouteFaresEditor({rows,stations,onChange}:{rows:RouteFareDraft[];stations:any[];onChange:(rows:RouteFareDraft[])=>void}){
  const {en,t}=useLocale();
  const cities=[...new Set(stations.map((s:any)=>s.city).filter(Boolean))] as string[];
  const update=(i:number,patch:Partial<RouteFareDraft>)=>onChange(rows.map((r,j)=>j===i?{...r,...patch}:r));
  const add=()=>{const a=cities[0]||'',b=cities.find(c=>c!==a)||'';onChange([...rows,{a,b,one:'',round:''}])};
  const problem=routeFaresProblem(rows,en);
  return <div className="route-fares">
    <h3>{t('أسعار حسب المسار','Fares by route')}</h3>
    <p className="ops-form-note">{t('حدد سعرًا خاصًا لكل مسار (مثل جدة ↔ المدينة). السعر يطبق في الاتجاهين. المسارات غير المضافة هنا تأخذ السعر العام أعلاه.','Set a fare for a specific route (e.g. Jeddah ↔ Madinah). It applies in both directions. Routes not listed use the general fare above.')}</p>
    {rows.map((row,i)=><div className="form-grid route-fare-row" key={i}>
      <label>{t('من مدينة','City')}<select required value={row.a} onChange={e=>update(i,{a:e.target.value})}><option value="">{t('اختر','Choose')}</option>{cities.map(c=><option key={c} value={c}>{cityName(c,en,stations)}</option>)}</select></label>
      <label>{t('إلى مدينة','City')}<select required value={row.b} onChange={e=>update(i,{b:e.target.value})}><option value="">{t('اختر','Choose')}</option>{cities.filter(c=>c!==row.a).map(c=><option key={c} value={c}>{cityName(c,en,stations)}</option>)}</select></label>
      <label>{t('ذهاب فقط','One-way')}<input type="number" dir="ltr" required min="0" max="10000" step="0.01" value={row.one} onChange={e=>update(i,{one:e.target.value})}/></label>
      <label>{t('ذهاب وعودة','Round trip')}<input type="number" dir="ltr" required min="0" max="10000" step="0.01" value={row.round} onChange={e=>update(i,{round:e.target.value})}/></label>
      <button type="button" className="secondary" aria-label={t('حذف سعر المسار','Remove route fare')} onClick={()=>onChange(rows.filter((_,j)=>j!==i))}><Trash2 size={16}/>{t('حذف','Remove')}</button>
    </div>)}
    {cities.length<2?<p className="ops-form-note">{t('أضف محطات في مدينتين مختلفتين على الأقل لتحديد أسعار المسارات.','Add stations in at least two cities to set route fares.')}</p>:<button type="button" className="secondary" onClick={add}><Plus size={16}/>{t('إضافة سعر مسار','Add route fare')}</button>}
    {problem&&rows.length>0&&<p className="error" role="alert">{problem}</p>}
  </div>;
}
