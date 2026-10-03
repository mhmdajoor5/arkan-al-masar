'use client';
import {MapPin,ExternalLink} from 'lucide-react';
import {useLocale} from '@/lib/arkan-client';
import {stationMapUrl} from '@/lib/station-map';
export default function StationMapLink({station,arabic=false,showName=false}:{station:any;arabic?:boolean;showName?:boolean}){
 const {en}=useLocale(),english=en&&!arabic,url=stationMapUrl(station?.mapUrl);
 if(!url)return null;
 const label=english?'Station location':'موقع المحطة',name=station?.[english?'en':'ar']||station?.ar||'';
 return <a className="station-map-link" href={url} target="_blank" rel="noopener noreferrer" aria-label={`${label}: ${name} — ${english?'opens in a new tab':'يفتح في نافذة جديدة'}`}><MapPin size={15}/><span>{showName?`${label}: ${name}`:label}</span><ExternalLink size={12}/></a>;
}
