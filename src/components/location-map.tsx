"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Navigation, Map, X } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";
import { addressMapUrl, pickupMapUrl } from "@/lib/map-url";
import {startMapNavigation} from "@/lib/native-navigation";
import type {MapProvider} from "@/lib/map-navigation";

type Props = { name: string; address?: string; url?: string | null; compact?: boolean; navigate?: boolean };

export function LocationMap({ name, address, url, compact = false, navigate = false }: Props) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const source = address?.trim() ? addressMapUrl(address) : pickupMapUrl(url);
  const label = navigate ? text(locale,"开始导航","Start navigation") : address ? text(locale, "地址地图", "Address map") : text(locale, "接送示意图", "Pickup diagram");
  if (!source) return <small className="map-pending">{text(locale, "接送示意图待补充", "Pickup diagram pending")}</small>;
  return <>
    <button type="button" className={compact ? "icon-button segment-map" : "map-link"} aria-label={compact ? `${name} · ${label}` : undefined} title={compact ? `${name} · ${label}` : undefined} onClick={() => setOpen(true)}>{compact ? <Navigation size={17} /> : address ? <Navigation size={14} /> : <Map size={14} />}{!compact && label}</button>
    {open && navigate && address ? <NavigationDialog name={name} address={address} close={()=>setOpen(false)}/> : open && <MapDialog title={`${name} · ${label}`} source={source} address={address} close={() => setOpen(false)} />}
  </>;
}

function NavigationDialog({name,address,close}:{name:string;address:string;close:()=>void}){
  const locale=useLocale();
  const dialog=useRef<HTMLDialogElement>(null);
  const titleId=useId();
  const [busy,setBusy]=useState<MapProvider|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{dialog.current?.showModal();},[]);
  async function start(provider:MapProvider){
    setBusy(provider);setError('');
    try{await startMapNavigation(provider,address,name);close();}
    catch{setError(text(locale,'无法打开所选地图，请确认地图 App 已安装。','Could not open the selected map. Check that the map app is installed.'));setBusy(null);}
  }
  return <dialog ref={dialog} className="record-dialog navigation-dialog" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();close();}} onClose={close}>
    <div className="record-dialog-heading"><div><h2 id={titleId}>{text(locale,'开始导航','Start navigation')} · {name}</h2><p className="map-address">{address}</p></div><button type="button" className="icon-button" aria-label={text(locale,'取消导航','Cancel navigation')} onClick={close}><X size={18}/></button></div>
    <div className="navigation-provider-list">
      <button type="button" className="button primary" disabled={busy!==null} onClick={()=>void start('apple')}>{busy==='apple'?text(locale,'正在打开…','Opening…'):text(locale,'使用 Apple 地图','Use Apple Maps')}</button>
      <button type="button" className="button secondary" disabled={busy!==null} onClick={()=>void start('google')}>{busy==='google'?text(locale,'正在打开…','Opening…'):text(locale,'使用 Google 地图','Use Google Maps')}</button>
    </div>
    {error&&<p className="inline-error" role="alert">{error}</p>}
  </dialog>;
}

function MapDialog({ title, source, address, close }: { title: string; source: string; address?: string; close: () => void }) {
  const locale = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="record-dialog map-dialog" aria-labelledby={titleId} onClose={close}>
    <div className="record-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label={text(locale, "关闭地图", "Close map")} title={text(locale, "关闭地图", "Close map")} onClick={close}><X size={18} /></button></div>
    {address && <p className="map-address">{address}</p>}
    {/* Opaque origin: no business-page access, top navigation, popups or native bridge. */}
    <iframe src={source} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" />
    <p className="map-notice">{text(locale, "地图空白或无法加载？可能是网络不可用或来源网站不允许内嵌查看。", "Map blank or unavailable? Check your connection; the source may not allow embedded viewing.")}</p>
  </dialog>;
}
