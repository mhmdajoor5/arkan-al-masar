 'use client';
import {Phone} from 'lucide-react';
import {useLocale} from '@/lib/arkan-client';
export default function CustomerPhones({mobile,additionalMobile}:{mobile?:string;additionalMobile?:string}){const{t}=useLocale();const numbers=[{value:mobile,label:t('جوال العميل','Customer mobile')},{value:additionalMobile,label:t('جوال إضافي','Additional mobile')}].filter(n=>n.value);return <div className="customer-phones">{numbers.length?numbers.map(n=>{const digits=n.value!.replace(/[^0-9]/g,'');return <a key={n.label} className="customer-phone" href={'tel:+'+(digits.startsWith('05')?'966'+digits.slice(1):digits)} aria-label={n.label+': '+n.value}><Phone size={16}/><span><small>{n.label}</small><bdi>{n.value}</bdi></span></a>}):<span>—</span>}</div>}
