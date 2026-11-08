import {z} from 'zod';

// A schedule with this end date keeps generating trips; the admin no longer has to reopen it each month.
export const OPEN_END='2099-12-31';

// Fares in SAR per passenger for a city pair. A pair applies in both directions
// (Jeddah ↔ Madinah). Pairs without a fare fall back to the general one/round settings.
export const routeFareSchema=z.object({
  a:z.string().trim().min(2).max(80),
  b:z.string().trim().min(2).max(80),
  one:z.number().min(0).max(10000),
  round:z.number().min(0).max(10000)
}).refine(f=>f.a!==f.b,{message:'INVALID_ROUTE'});
export const routeFaresSchema=z.array(routeFareSchema).max(100).refine(list=>new Set(list.map(f=>pairKey(f.a,f.b))).size===list.length,{message:'DUPLICATE_ROUTE_FARE'});
export type RouteFare=z.infer<typeof routeFareSchema>;

export const pairKey=(a:string,b:string)=>[a,b].sort().join('|');

type Station={id:string;city?:string};
type FareSettings={one?:unknown;round?:unknown;routeFares?:unknown};

export function routeFare(settings:FareSettings,fromCity?:string,toCity?:string){
  const list=Array.isArray(settings.routeFares)?settings.routeFares as RouteFare[]:[];
  const match=fromCity&&toCity?list.find(f=>pairKey(f.a,f.b)===pairKey(fromCity,toCity)):undefined;
  return {one:Number(match?match.one:settings.one??15),round:Number(match?match.round:settings.round??30),custom:!!match};
}

// Price per passenger in halalas for a one-way or round-trip booking between two stations.
export function fareFor(settings:FareSettings,stations:Station[],from:string,to:string,round:boolean){
  const city=(id:string)=>stations.find(s=>s.id===id)?.city;
  const fare=routeFare(settings,city(from),city(to));
  return Math.round((round?fare.round:fare.one)*100);
}
