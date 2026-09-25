import ArkanApp from '../arkan-app';
export default async function Page({params}:{params:Promise<{slug:string[]}>}){const {slug}=await params;return <ArkanApp initialView={slug[0]}/>}
