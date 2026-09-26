'use client';

import {useSyncExternalStore} from 'react';
import {ArrowLeft,ArrowRight,ArrowUpRight,Bell,BusFront,ChevronLeft,ChevronRight,FileText,House,KeyRound,LayoutGrid,LogOut,ScanLine,ShieldCheck,Ticket,type LucideIcon} from 'lucide-react';
import {Sidebar} from '@/components/ui/sidebar';
import {useLocale} from '@/lib/arkan-client';
import {staffLogout} from './staff-access';
import {PushEnable} from './trip-status';

export type AdminTab='overview'|'trips'|'bookings'|'scan'|'manifest'|'station'|'bus'|'driver'|'schedule'|'reports'|'settings'|'staff'|'private'|'packages'|'more';
export type AdminNavItem=[AdminTab,string,LucideIcon];

const desktopQuery='(min-width: 1024px)';
function subscribeDesktop(onChange:()=>void){const media=window.matchMedia(desktopQuery);media.addEventListener('change',onChange);return()=>media.removeEventListener('change',onChange)}
const getDesktop=()=>window.matchMedia(desktopQuery).matches;
const getServerDesktop=()=>false;

export function AdminDesktopSidebar({children}:{children:React.ReactNode}){
  const {en}=useLocale();
  const desktop=useSyncExternalStore(subscribeDesktop,getDesktop,getServerDesktop);
  return desktop?<Sidebar side={en?'left':'right'} className="admin-sidebar">{children}</Sidebar>:null;
}

export function AdminBottomNav({tab,isAdmin,onSelect}:{tab:AdminTab;isAdmin:boolean;onSelect:(tab:AdminTab)=>void}){
  const {t}=useLocale();
  const items:AdminNavItem[]=isAdmin?[
    ['overview',t('الرئيسية','Home'),House],
    ['trips',t('الرحلات','Trips'),BusFront],
    ['bookings',t('الحجوزات','Bookings'),Ticket],
    ['scan',t('الفحص','Scan'),ScanLine],
    ['more',t('المزيد','More'),LayoutGrid],
  ]:[['scan',t('الفحص','Scan'),ScanLine],['manifest',t('الركاب','Passengers'),FileText],['more',t('المزيد','More'),LayoutGrid]];
  const current=items.some(([key])=>key===tab)?tab:'more';
  return <nav className="ops-bottom-nav" aria-label={t('التنقل في لوحة التحكم','Control panel navigation')}>
    {items.map(([key,label,Icon])=><button type="button" key={key} className={current===key?'active':''} aria-current={current===key?'page':undefined} onClick={()=>onSelect(key)}><span><Icon size={23}/></span><b>{label}</b></button>)}
  </nav>;
}

export function AdminMobileBack({onBack}:{onBack:()=>void}){
  const {en,t}=useLocale();
  return <button type="button" className="ops-mobile-back" onClick={onBack} aria-label={t('العودة إلى المزيد','Back to More')}>{en?<ArrowLeft size={21}/>:<ArrowRight size={21}/>}</button>;
}

export function AdminMorePage({items,user,isAdmin,onSelect}:{items:AdminNavItem[];user:{name:string;email:string};isAdmin:boolean;onSelect:(tab:AdminTab)=>void}){
  const {en,t}=useLocale();
  const groups:{title:string;keys:AdminTab[]}[]=isAdmin?[
    {title:t('الركاب والتقارير','Passengers & reports'),keys:['manifest','reports']},
    {title:t('الأسطول والمحطات','Fleet & stations'),keys:['driver','bus','station','schedule']},
    {title:t('إدارة النظام','Administration'),keys:['private','packages','staff','settings']},
  ]:[];
  const descriptions:Partial<Record<AdminTab,string>>={
    manifest:t('كشف الرحلة وحالة صعود الركاب','Trip manifest and boarding status'),
    reports:t('المبيعات والإشغال وعدم الحضور','Sales, occupancy and no-shows'),
    driver:t('بيانات السائقين','Driver profiles'),
    bus:t('الحافلات وأرقام اللوحات','Buses and plate numbers'),
    station:t('نقاط المغادرة والوصول','Departure and arrival points'),
    schedule:t('مواعيد الرحلات المتكررة','Recurring departure schedules'),
    staff:t('حسابات الدخول والصلاحيات','Sign-in accounts and permissions'),
    private:t('طلبات وأسعار وتعيين الحافلات الخاصة','Private requests, prices and assignments'),
    packages:t('الباقات والأسعار والتفاصيل والظهور','Packages, prices, details and visibility'),
    settings:t('الأسعار والتواصل وسياسة الإلغاء','Fares, contact and cancellation policy'),
  };
  const Arrow=en?ChevronRight:ChevronLeft;
  return <div className="ops-more-page">
    <section className="ops-account-card"><span><ShieldCheck size={26}/></span><div><h2>{user.name}</h2><p>{isAdmin?t('مدير النظام','Administrator'):t('موظف صعود','Check-in staff')}</p><small dir="ltr">{user.email}</small></div></section>
    {groups.map(group=><section className="ops-more-group" key={group.title}><h2>{group.title}</h2><div>{group.keys.map(key=>{const item=items.find(([id])=>id===key);if(!item)return null;const[,label,Icon]=item;return <button type="button" key={key} onClick={()=>onSelect(key)}><span className="ops-more-icon"><Icon size={22}/></span><span className="ops-more-label"><b>{label}</b><small>{descriptions[key]}</small></span><Arrow size={18}/></button>})}</div></section>)}
    <section className="panel ops-more-notifications"><h2><Bell size={21}/>{t('إشعارات الرحلات','Trip notifications')}</h2><PushEnable audience="staff"/></section>
    <section className="ops-more-group"><h2>{t('حسابي','My account')}</h2><div>
      <button type="button" onClick={()=>window.dispatchEvent(new Event('arkan-change-password'))}><span className="ops-more-icon"><KeyRound size={22}/></span><span className="ops-more-label"><b>{t('تغيير كلمة المرور','Change password')}</b></span><Arrow size={18}/></button>
      <a href="/" target="_blank" rel="noopener noreferrer"><span className="ops-more-icon"><ArrowUpRight size={22}/></span><span className="ops-more-label"><b>{t('فتح موقع الحجز','Open booking website')}</b></span><Arrow size={18}/></a>
      <button type="button" className="ops-sign-out" onClick={()=>void staffLogout()}><span className="ops-more-icon"><LogOut size={22}/></span><span className="ops-more-label"><b>{t('تسجيل الخروج','Sign out')}</b></span><Arrow size={18}/></button>
    </div></section>
  </div>;
}
