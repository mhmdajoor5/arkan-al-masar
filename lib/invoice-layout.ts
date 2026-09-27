import type {jsPDF} from 'jspdf';
import {attendance} from './ticket-details';

// Let the browser shape Alexandria Arabic. jsPDF's Arabic shaper drops some
// Alexandria glyphs; high-resolution text images preserve the exact web font.
let assets:Promise<Uint8Array>|undefined;
async function loadAssets(){
 if(!assets)assets=(async()=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
   const fetchBytes=async(path:string)=>{const r=await fetch(path,{signal:controller.signal});if(!r.ok)throw Error('PDF_FONT_UNAVAILABLE');return r.arrayBuffer()};
   const [regular,bold,logo]=await Promise.all([fetchBytes('/fonts/Alexandria-400.ttf'),fetchBytes('/fonts/Alexandria-600.ttf'),fetchBytes('/brand/logo-forest.png')]);
   const fonts=await Promise.all([new FontFace('ArkanInvoice',regular,{weight:'400'}).load(),new FontFace('ArkanInvoice',bold,{weight:'600'}).load()]);
   fonts.forEach(f=>document.fonts.add(f));return new Uint8Array(logo);
  }finally{clearTimeout(timer)}
 })().catch(e=>{assets=undefined;throw e});
 return assets;
}
const scale=8,pt=25.4/72;
function painter(p:jsPDF){
 const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');if(!ctx)throw Error('PDF_FONT_UNAVAILABLE');
 const font=(size:number,bold:boolean)=>`${bold?600:400} ${size*pt*scale}px ArkanInvoice`;
 const width=(s:string,size:number,bold=false)=>{ctx.font=font(size,bold);return ctx.measureText(s).width/scale};
 const lines=(value:string,max:number,size=9,bold=false)=>{
  const out:string[]=[];for(const paragraph of String(value).split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(width(word,size,bold)>max){if(line){out.push(line);line=''}for(const char of word){if(line&&width(line+char,size,bold)>max){out.push(line);line=''}line+=char}}else if(line&&width(line+' '+word,size,bold)>max){out.push(line);line=word}else line+=(line?' ':'')+word}if(line)out.push(line)}return out;
 };
 const text=(s:string,x:number,y:number,w:number,size=9,bold=false,color='#243f35',align:'right'|'left'|'center'='right')=>{
  const h=size*pt*2;canvas.width=Math.ceil((w+2)*scale);canvas.height=Math.ceil(h*scale);let fitted=size;ctx.font=font(fitted,bold);while(ctx.measureText(s).width>w*scale&&fitted>5){fitted-=.25;ctx.font=font(fitted,bold)}ctx.fillStyle=color;ctx.direction=/[\u0600-\u06ff]/.test(s)?'rtl':'ltr';ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(String(s),(align==='right'?w+1:align==='left'?1:(w+2)/2)*scale,h*scale/2);
  p.addImage(canvas.toDataURL('image/png'),'PNG',x-1,y-h/2,w+2,h,undefined,'FAST');
 };
 const wrap=(s:string,x:number,y:number,w:number,size=9,bold=false,color='#243f35')=>{const a=lines(s,w,size,bold);a.forEach((line,n)=>text(line,x,y+n*5.7,w,size,bold,color));return y+a.length*5.7};
 return {text,wrap,lines,width};
}
export async function brandedInvoicePDF(data:any,number:string,qrValue:string):Promise<Blob>{
 const [logo,{jsPDF},{default:QR}]=await Promise.all([loadAssets(),import('jspdf'),import('qrcode')]);
 const p=new jsPDF({unit:'mm',format:'a4',compress:true}),r=painter(p),i=data.invoice,c=i.seller;
 p.setProperties({title:number,subject:'فاتورة أركان المسار',author:c.companyName});
 const box=(x:number,y:number,w:number,h:number)=>{p.setFillColor('#f2f5f0');p.roundedRect(x,y,w,h,3,3,'F')};
 const heading=()=>{
  p.setFillColor('#193f34');p.rect(0,0,210,32,'F');p.setFillColor('#fff');p.roundedRect(155,6,39,21,2.5,2.5,'F');p.addImage(logo,'PNG',157,7.8,35,17.5);
  let size=16;while(r.width(c.companyName,size,true)>131&&size>8)size-=.5;
  r.text(c.companyName,16,14,131,size,true,'#fff');r.text('فاتورة',16,24,131,10,false,'#d6e5dc');
 };heading();
 let y=43;
 const ensure=(height:number)=>{if(y+height>260){p.addPage();heading();r.text(number,16,40,178,9);y=51}};
 r.text('بيانات الفاتورة',110,y,84,13,true);r.text(number,16,y,90,10,true,'#243f35','left');y+=9;
 r.text('تاريخ الإصدار: '+new Date(i.issuedAt).toLocaleString('en-GB',{timeZone:'Asia/Riyadh',hour12:false})+' — توقيت السعودية',16,y,178,8);y+=7;
 r.text('الرقم الضريبي: '+c.taxNumber,16,y,178,9);y+=7;
 r.text('السجل / الرقم الموحد: '+c.companyRegistration,16,y,178,8.5);y+=7;
 y=r.wrap('العنوان: '+c.companyAddress,16,y,178,8.5)+5;
 const customerLines=r.lines('العميل: '+i.customer.name,166,10,true),customerHeight=25+customerLines.length*5.7;ensure(customerHeight+5);box(16,y,178,customerHeight);
 r.wrap('العميل: '+i.customer.name,22,y+8,166,10,true);r.text('رقم الحجز: '+i.bookingCode,22,y+14+customerLines.length*5.7,166,9);
 r.text('طريقة الدفع: '+(i.paymentMethod==='cash'?'نقدًا':'إلكتروني'),105,y+customerHeight-5,83,8.5);r.text(i.customer.mobile||'—',22,y+customerHeight-5,80,9,false,'#243f35','left');y+=customerHeight+7;
 ensure(20);r.text('تفاصيل الخدمة',16,y,178,12,true);y+=8;y=r.wrap(i.description,16,y,178,10,true)+2;
 // Group the persisted journey details without replacing any stored information.
 const groups:{title:string;rows:string[]}[]=[],before:string[]=[];let current:typeof groups[number]|undefined;
 for(const detail of i.details as string[]){const match=detail.match(/^(الذهاب|العودة):\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);if(match){current={title:match[1]==='الذهاب'?'رحلة الذهاب':'رحلة العودة',rows:['التاريخ: '+match[2],'الانطلاق: '+match[3]]};groups.push(current);if(!i.bookingCode.startsWith('PV-')){const at=attendance(match[2],match[3]);current.rows.push('الحضور: '+at.time+(at.date!==match[2]?' · '+at.date:''))}}else if(current&&!/^(الفندق|نوع الغرفة|الغرف|الدخول):/.test(detail)){current.rows.push(detail)}else{current=undefined;before.push(detail)}}
 for(const detail of before){for(const line of r.lines(detail,178,8.5)){ensure(7);r.text(line,16,y,178,8.5);y+=5.7}}y+=1;
 const cards=groups.flatMap(g=>{const all=g.rows.flatMap(row=>r.lines(row,74,8.5)),result:typeof groups=[];for(let n=0;n<all.length;n+=22)result.push({title:g.title+(n?' (تابع)':''),rows:all.slice(n,n+22)});return result});
 for(let index=0;index<cards.length;index+=2){const pair=cards.slice(index,index+2),w=pair.length===2?86:178;
  const heights=pair.map(g=>17+g.rows.reduce((n,s)=>n+r.lines(s,w-12,8.5).length*5.7,0)),height=Math.max(...heights);ensure(height+7);
  pair.forEach((g,n)=>{const x=pair.length===2?(n===0?108:16):16;p.setDrawColor('#dce4dd');p.roundedRect(x,y,w,height,3,3,'S');r.text(g.title,x+6,y+8,w-12,10,true);let gy=y+16;for(const row of g.rows)gy=r.wrap(row,x+6,gy,w-12,8.5)});y+=height+3;
 }
 ensure(60);box(69,y,125,43);const totals=[['المبلغ قبل الضريبة',i.subtotal],['ضريبة القيمة المضافة (15%)',i.vat],['الإجمالي شامل الضريبة',i.total]] as const;
 totals.forEach(([label,value],n)=>{r.text(label,110,y+9+n*12,78,n===2?10:8.5,n===2);r.text((value/100).toFixed(2)+' ر.س',75,y+9+n*12,33,n===2?12:10,true);if(n<2){p.setDrawColor('#dce4dd');p.line(75,y+14+n*12,188,y+14+n*12)}});
 p.addImage(await QR.toDataURL(qrValue,{width:400,margin:2}),'PNG',19,y,37,37);r.text('رمز بيانات الفاتورة',16,y+41,43,7,false,'#65746b','center');y+=51;
 r.text('حالة الدفع الحالية: '+(data.paymentStatus==='paid'?'مدفوع':'غير مدفوع'),16,y,178,9,true);y+=7;
 for(const note of [...(data.bookingStatus==='cancelled'?['الحجز ملغى — هذه النسخة لا تثبت استرداد المبلغ.']:[]),...(data.paymentStatus!=='paid'?['هذه الفاتورة لا تثبت استلام المبلغ.']:[])]){ensure(7);r.text(note,16,y,178,8,false,'#65746b');y+=6}
 for(let page=1;page<=p.getNumberOfPages();page++){p.setPage(page);p.setDrawColor('#d8e2d8');p.line(16,267,194,267);r.text([c.phone,c.email].filter(Boolean).join(' | '),16,274,178,8,false,'#53614b','center');r.text([c.snapchat?'سناب شات: '+c.snapchat:'',c.tiktok?'تيك توك: '+c.tiktok:''].filter(Boolean).join('   |   '),16,281,178,8,false,'#53614b','center');r.text('صفحة '+page+' من '+p.getNumberOfPages(),16,289,178,7,false,'#65746b','center')}
 return p.output('blob');
}
