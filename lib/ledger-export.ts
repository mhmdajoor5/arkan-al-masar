import {companyProfile} from './company-profile';
export type LedgerRow={id:string;category:string;party:string;displayParty?:string;entryDate:string;statement:string;description:string;debit:number;credit:number;running:number};
export type LedgerReport={entries:LedgerRow[];summary:{debit:number;credit:number;balance:number;count:number}};
const categories:Record<string,string>={supplier:'الموردون',customer:'العملاء',driver:'السائقون',purchase:'المشتريات',management:'الإدارة',debt:'الديون',rent:'الإيجارات الشهرية'};
const headers=['التاريخ','القسم','الجهة / الشخص','البيان','الوصف','مدين (ر.س)','دائن (ر.س)','الرصيد (ر.س)'];
const values=(r:LedgerRow)=>([r.entryDate,categories[r.category]||r.category,r.displayParty||r.party,r.statement,r.description,r.debit/100,r.credit/100,r.running/100]);
const xml=(s:unknown)=>String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
// Minimal standard ZIP container (stored entries); spreadsheet text is always
// inlineStr, never a formula, including values beginning with =, +, - or @.
function zip(files:Record<string,string>){
 const enc=new TextEncoder(),parts:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
 const crc=(a:Uint8Array)=>{let c=0xffffffff;for(const b of a){c^=b;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0};
 for(const [path,text] of Object.entries(files)){
  const name=enc.encode(path),data=enc.encode(text),sum=crc(data),h=new Uint8Array(30+name.length),v=new DataView(h.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,sum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);h.set(name,30);parts.push(h,data);
  const ch=new Uint8Array(46+name.length),cv=new DataView(ch.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint32(16,sum,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);ch.set(name,46);central.push(ch);offset+=h.length+data.length;
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer),size=central.reduce((n,p)=>n+p.length,0);e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
 return new Blob([...parts,...central,end] as BlobPart[],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
type Table={title:string;headers:string[];rows:(string|number)[][];totals:(string|number)[];money:number[];widths:number[]};
const isMoney=(table:Table,j:number)=>table.money.includes(j);
function workbook(table:Table,filter:string,companyName:string,sheetName:string){
 const rows:(string|number)[][]=[[companyName],[table.title],[filter],['الرصيد = الدائن − المدين'],table.headers,...table.rows,table.totals];
 const last=table.headers.length-1;
 // Debit column (first money column) and negative balances (last column) are red.
 const style=(j:number,v:number)=>j===table.money[0]||j===last&&v<0?2:1;
 const sheet=rows.map((row,i)=>`<row r="${i+1}">${row.map((v,j)=>{const r=String.fromCharCode(65+j)+(i+1);return typeof v==='number'?`<c r="${r}" s="${style(j,v)}"><v>${v}</v></c>`:`<c r="${r}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`}).join('')}</row>`).join('');
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',col=String.fromCharCode(65+last);
 const cols=table.widths.map((w,j)=>`<col min="${j+1}" max="${j+1}" width="${w}" customWidth="1"/>`).join('');
 return zip({
 '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
 'xl/styles.xml':`<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><sz val="11"/><name val="Arial"/><color rgb="FFB42318"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1" readingOrder="2"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
 'xl/worksheets/sheet1.xml':`<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${sheet}</sheetData><autoFilter ref="A5:${col}${5+table.rows.length}"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>`
 });
}
async function tablePDF(table:Table,filter:string,settings:Record<string,any>,widths:number[],footer:[string,string?][]){
 const [{jsPDF},{loadAssets,painter}]=await Promise.all([import('jspdf'),import('./invoice-layout')]);const logo=await loadAssets(),company=companyProfile(settings);
 const p=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true}),r=painter(p);
 p.setProperties({title:table.title,author:company.companyName});
 const xs=widths.map((_,i)=>283-widths.slice(0,i+1).reduce((a,b)=>a+b,0)),last=table.headers.length-1;
 const heading=()=>{p.setFillColor('#173f35');p.rect(0,0,297,31,'F');p.setFillColor('#ffffff');p.roundedRect(251,4,33,22,2,2,'F');p.addImage(logo,'PNG',252,7,31,15.5);r.text(company.companyName,14,12,226,14,true,'#ffffff');r.text(table.title,14,23,226,10,false,'#ffffff');r.text(filter,14,39,269,8);r.text('الرصيد = الدائن − المدين | جميع المبالغ بالريال السعودي',14,47,269,8);p.setFillColor('#eee7db');p.rect(10,52,277,11,'F');table.headers.forEach((h,i)=>r.text(h,xs[i]+1,58,widths[i]-2,8,true));return 69};
 let y=heading();
 for(const row of table.rows){const cells=row.map((v,i)=>typeof v==='number'&&isMoney(table,i)?v.toFixed(2):String(v));const lines=cells.map((v,i)=>r.lines(v,widths[i]-3,8));const count=Math.max(1,...lines.map(v=>v.length));let index=0;const negative=Number(row[last])<0;
  while(index<count){if(y+6>184){p.addPage();y=heading()}const n=Math.min(count-index,Math.floor((184-y)/5.7));lines.forEach((ls,i)=>ls.slice(index,index+n).forEach((v,j)=>r.text(v,xs[i]+1,y+j*5.7,widths[i]-3,8,false,i===table.money[0]||i===last&&negative?'#b42318':'#182c23')));y+=n*5.7;index+=n;if(index<count){p.addPage();y=heading()}}
  p.setDrawColor('#dce3d8');p.line(10,y,287,y);y+=5;
 }
 if(y+13>184){p.addPage();y=heading()}
 footer.forEach(([text,color],i)=>r.text(text,[214,144,74,14][i],y+4,i===3?59:69,9,true,color||'#182c23'));
 for(let page=1;page<=p.getNumberOfPages();page++){p.setPage(page);r.text([company.phone,company.email,company.snapchat?'Snapchat: '+company.snapchat:''].filter(Boolean).join(' | '),14,196,269,8);r.text(`صفحة ${page} / ${p.getNumberOfPages()}`,14,204,269,8)}return p.output('blob');
}
const totalsFooter=(s:{debit:number;credit:number;balance:number},count:string):[string,string?][]=>[[`مدين: ${(s.debit/100).toFixed(2)}`,'#b42318'],[`دائن: ${(s.credit/100).toFixed(2)}`],[`الرصيد: ${(s.balance/100).toFixed(2)}`,s.balance<0?'#b42318':'#182c23'],[count]];
const ledgerTable=(report:LedgerReport):Table=>({title:'دفتر الحسابات',headers,rows:report.entries.map(values),totals:['الإجمالي','','','','',report.summary.debit/100,report.summary.credit/100,report.summary.balance/100],money:[5,6,7],widths:[18,18,28,28,45,20,20,20]});
export function ledgerExcel(report:LedgerReport,filter:string,companyName:string){return workbook(ledgerTable(report),filter,companyName,'دفتر الحسابات')}
export async function ledgerPDF(report:LedgerReport,filter:string,settings:Record<string,any>){return tablePDF(ledgerTable(report),filter,settings,[24,27,40,42,65,25,25,25],totalsFooter(report.summary,`عدد الحركات: ${report.summary.count}`))}

// The accounts list: one row per account with its debit, credit and balance.
export type AccountRow={category:string;name:string;displayName?:string;phone?:string;email?:string;count:number;debit:number;credit:number;balance:number};
// Show why the totals differ from the column sums: internal transfers are left out.
const internalRow=(accounts:AccountRow[],totals:{debit:number}):(string|number)[][]=>{const internal=accounts.reduce((n,a)=>n+a.debit,0)-totals.debit;return internal>0?[['تحويلات داخلية بين هذه الحسابات (لا تُحسب في الإجمالي)','','','','',-internal/100,-internal/100,0]]:[]};
const accountsTable=(accounts:AccountRow[],totals:{debit:number;credit:number;balance:number}):Table=>({title:'كشف الحسابات',headers:['الحساب','القسم','الجوال','البريد','عدد الحركات','مدين (ر.س)','دائن (ر.س)','الرصيد (ر.س)'],rows:[...accounts.map(a=>[a.displayName||a.name,categories[a.category]||a.category,a.phone||'',a.email||'',a.count,a.debit/100,a.credit/100,a.balance/100]),...internalRow(accounts,totals)],totals:['الإجمالي','','','',accounts.reduce((n,a)=>n+a.count,0),totals.debit/100,totals.credit/100,totals.balance/100],money:[5,6,7],widths:[30,18,18,28,14,20,20,20]});
export function accountsExcel(accounts:AccountRow[],totals:{debit:number;credit:number;balance:number},filter:string,companyName:string){return workbook(accountsTable(accounts,totals),filter,companyName,'كشف الحسابات')}
export async function accountsPDF(accounts:AccountRow[],totals:{debit:number;credit:number;balance:number},filter:string,settings:Record<string,any>){return tablePDF(accountsTable(accounts,totals),filter,settings,[50,30,30,45,22,32,34,34],totalsFooter(totals,`عدد الحسابات: ${accounts.length}`))}
