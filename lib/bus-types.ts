export const busTypes=[{seats:49,ar:'أركان الكبيرة',en:'Arkan Large'},{seats:24,ar:'أركان المتوسطة',en:'Arkan Medium'},{seats:13,ar:'أركان الصغيرة',en:'Arkan Small'}] as const;
export function busName(bus:any,en=false){return bus?.name||busTypes.find(x=>x.seats===Number(bus?.seats))?.[en?'en':'ar']||bus?.id||''}
export function busLabel(bus:any,en=false){return [busName(bus,en),bus?.plate].filter(Boolean).join(' · ')}
export function seatRows(capacity:number){if(capacity===49)return [...Array.from({length:11},(_,i)=>[i*4+1,i*4+2,0,i*4+3,i*4+4]),[45,46,47,48,49]];if(capacity===24)return Array.from({length:6},(_,i)=>[i*4+1,i*4+2,0,i*4+3,i*4+4]);if(capacity===13)return [...Array.from({length:4},(_,i)=>[i*3+1,0,0,i*3+2,i*3+3]),[0,0,0,0,13]];return []}
