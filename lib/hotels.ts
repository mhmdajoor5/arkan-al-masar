import {z} from 'zod';
const text=(max:number)=>z.string().trim().max(max);
export const hotelRoomSchema=z.object({id:text(100).min(1),name:text(120).min(1),capacity:z.number().int().min(1).max(8),price:z.number().min(0).max(100000)});
export const hotelSchema=z.object({
 ar:text(180).min(2),en:text(180),city:text(80).min(2),address:text(300),phone:text(20).refine(v=>!v||/^\+?\d{7,15}$/.test(v)),
 stars:z.number().int().min(0).max(5),roomTypes:z.array(hotelRoomSchema).max(30),notes:text(1000),active:z.boolean()
}).refine(v=>new Set(v.roomTypes.map(r=>r.id)).size===v.roomTypes.length);
export type Hotel=z.infer<typeof hotelSchema>&{id:string};
