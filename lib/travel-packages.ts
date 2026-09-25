import {z} from 'zod';
const text=(max:number)=>z.string().trim().max(max);
const date=z.string().refine(v=>!v||/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v);
export const packageSchema=z.object({
 ar:text(120).min(2),en:text(120),descriptionAr:text(2000).min(3),descriptionEn:text(2000),
 benefitsAr:text(2000),benefitsEn:text(2000),termsAr:text(3000),termsEn:text(3000),
 image:text(2048).refine(v=>!v||/^https:\/\//.test(v)&&z.string().url().safeParse(v).success),
 price:z.number().min(0).max(100000),tripCount:z.number().int().min(1).max(1000),validDays:z.number().int().min(1).max(3650),
 type:z.enum(['rides','offer']),start:date,end:date,sort:z.number().int().min(0).max(9999),active:z.boolean(),featured:z.boolean()
}).refine(v=>!v.start||!v.end||v.start<=v.end);
export type TravelPackage=z.infer<typeof packageSchema>&{id:string};
export function packageVisible(p:Pick<TravelPackage,'active'|'start'|'end'>,date:string){return p.active&&(!p.start||p.start<=date)&&(!p.end||p.end>=date)}
export function sortPackages<T extends {sort:number;ar:string}>(items:T[]){return [...items].sort((a,b)=>a.sort-b.sort||a.ar.localeCompare(b.ar,'ar'))}
