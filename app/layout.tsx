import type { Metadata, Viewport } from 'next';
import './globals.css';
import {startupBootstrap} from '@/lib/startup-bootstrap';
export const viewport: Viewport = {width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#faf9f5'};
export const metadata: Metadata = {title:'أركان المسار | رحلات جدة ومكة',description:'احجز رحلتك بين جدة ومكة. اختر موعدك ومقعدك وتابع حجزك بسهولة.',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'أركان المسار',statusBarStyle:'default'},icons:{icon:'/favicon.svg',apple:'/brand/logo-forest.png'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:startupBootstrap}}/><link rel="preload" href="/brand/logo-forest.png" as="image"/><link rel="preload" href="/fonts/Alexandria-400.ttf" as="font" type="font/ttf" crossOrigin="anonymous"/><link rel="preload" href="/fonts/Alexandria-700.ttf" as="font" type="font/ttf" crossOrigin="anonymous"/></head><body>{children}</body></html>}
