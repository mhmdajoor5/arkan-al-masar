// Only absolute web links are suitable for both browser anchors and PDF actions.
export function stationMapUrl(value:unknown):string{
 if(typeof value!=='string')return '';
 const link=value.trim();if(!link||link.length>2048||/[\u0000-\u0020\u007f]/.test(link))return '';
 try{const url=new URL(link);return /^https?:$/.test(url.protocol)&&url.hostname&&!url.username&&!url.password?url.href:''}catch{return ''}
}
