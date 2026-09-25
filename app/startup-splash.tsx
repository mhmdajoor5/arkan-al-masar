'use client';

import {useEffect} from 'react';
import {ArrowLeft,ArrowRight} from 'lucide-react';
import {useLocale} from '@/lib/arkan-client';

export default function StartupSplash(){
  const {en,t}=useLocale();
  function dismiss(){
    const hadFocus=document.activeElement?.closest('.startup-splash');
    document.documentElement.removeAttribute('data-arkan-splash');
    if(hadFocus)document.getElementById('home-heading')?.focus({preventScroll:true});
  }
  useEffect(()=>{
    if(document.documentElement.dataset.arkanSplash!=='show')return;
    const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape'||event.key==='Tab')dismiss()};
    const focusin=(event:FocusEvent)=>{if(event.target instanceof Element&&!event.target.closest('.startup-splash'))dismiss()};
    document.addEventListener('keydown',keydown);
    document.addEventListener('focusin',focusin);
    return()=>{
      document.removeEventListener('keydown',keydown);
      document.removeEventListener('focusin',focusin);
      document.documentElement.removeAttribute('data-arkan-splash');
    };
  },[]);
  return <section className="startup-splash" aria-label={t('مرحبًا بك في أركان المسار','Welcome to Arkan Al-Masar')} onAnimationEnd={event=>{if(event.target===event.currentTarget&&event.animationName==='arkan-splash-exit')dismiss()}}>
    <div className="splash-atmosphere" aria-hidden="true"><i/><i/><i/></div>
    <button type="button" className="splash-skip" onClick={dismiss}>{t('تخطي','Skip')}{en?<ArrowRight size={16}/>:<ArrowLeft size={16}/>}</button>
    <div className="splash-identity">
      <div className="splash-logo"><img src="/brand/logo-forest.png" width="320" height="160" alt="أركان المسار" decoding="sync" fetchPriority="high"/></div>
      <span className="splash-wordmark" lang="en" dir="ltr">ARKAN AL-MASAR</span>
      <div className="splash-divider" aria-hidden="true"/>
      <p className="splash-tagline">{t('رحلتك، بكل راحة.','Your journey, in comfort.')}</p>
      <span className="splash-supporting">{t('من الحجز حتى الوصول.','From booking to arrival.')}</span>
      <div className="splash-signature" aria-hidden="true"><span/></div>
    </div>
  </section>;
}
