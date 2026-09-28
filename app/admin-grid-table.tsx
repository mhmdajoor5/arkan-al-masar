'use client';
import {FileText} from 'lucide-react';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';

export default function GridTable({headers,rows,empty}:{headers:string[];rows:any[][];empty?:string}){return <div className="ops-table"><Table><TableHeader><TableRow>{headers.map((h,i)=><TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((r,i)=><TableRow key={i}>{r.map((c,j)=><TableCell key={j} data-label={headers[j]}><div className="ops-cell-value">{c}</div></TableCell>)}</TableRow>)}</TableBody></Table>{!rows.length&&<div className="ops-empty"><FileText size={30}/><p>{empty}</p></div>}</div>}
