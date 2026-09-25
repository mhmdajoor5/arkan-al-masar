import {z} from 'zod';
import {authStatus,authAction} from '@/lib/operations-auth';
export const dynamic='force-dynamic';
const response=(data:unknown,status=200,cookie?:string)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})}});
export async function GET(){try{return response(await authStatus())}catch{return response({error:'SERVICE_UNAVAILABLE'},503)}}
export async function POST(req:Request){try{if(req.headers.get('origin')!==new URL(req.url).origin||!req.headers.get('content-type')?.includes('application/json'))return response({error:'FORBIDDEN'},403);const text=await req.text();if(text.length>4000)return response({error:'INVALID_INPUT'},400);const result=await authAction(JSON.parse(text),req);return response(result.data,200,result.cookie)}catch(e:any){return response({error:e instanceof z.ZodError||e instanceof SyntaxError?'INVALID_INPUT':e.status?e.message:'SERVICE_UNAVAILABLE'},e instanceof z.ZodError||e instanceof SyntaxError?400:e.status||503)}}
