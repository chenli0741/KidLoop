"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Map, X } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";
import { addressMapUrl, pickupMapUrl } from "@/lib/map-url";

type Props = { name: string; address?: string; url?: string | null };

export function LocationMap({ name, address, url }: Props) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const source = address?.trim() ? addressMapUrl(address) : pickupMapUrl(url);
  const label = address ? text(locale, "地址地图", "Address map") : text(locale, "接送示意图", "Pickup diagram");
  if (!source) return <small className="map-pending">{text(locale, "接送示意图待补充", "Pickup diagram pending")}</small>;
  return <>
    <button type="button" className="map-link" onClick={() => setOpen(true)}>{address ? <MapPin size={14} /> : <Map size={14} />}{label}</button>
    {open && <MapDialog title={`${name} · ${label}`} source={source} address={address} close={() => setOpen(false)} />}
  </>;
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
