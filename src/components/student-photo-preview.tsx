'use client';
import Image from 'next/image';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {text,type Locale} from '@/lib/i18n';
import s from './student-photo-preview.module.css';

export function StudentPhotoPreview({src,name,locale,sizes='80px'}:{src:string;name:string;locale:Locale;sizes?:string}) {
 const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null);
 function close(){setOpen(false);trigger.current?.focus();}
 return <>
  <button ref={trigger} type="button" className={s.trigger} onClick={()=>setOpen(true)} aria-haspopup="dialog" aria-label={text(locale,`查看 ${name} 的照片`,`View ${name}'s photo`)}>
   <Image src={src} alt={name} fill sizes={sizes} unoptimized={src.startsWith('/api/')}/>
  </button>
  {open&&createPortal(<PhotoDialog src={src} name={name} locale={locale} close={close}/>,document.body)}
 </>;
}
function PhotoDialog({src,name,locale,close}:{src:string;name:string;locale:Locale;close:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();},[]);
 function dismiss(){dialog.current?.close();close();}
 return <dialog ref={dialog} className={s.dialog} aria-label={text(locale,`${name} 的照片`,`${name}'s photo`)} onCancel={e=>{e.preventDefault();dismiss();}} onClick={e=>{if(e.target===e.currentTarget)dismiss();}}>
  <header className={s.header}><strong>{name}</strong><button type="button" className={s.close} onClick={dismiss} aria-label={text(locale,'关闭','Close')} title={text(locale,'关闭','Close')}><X size={22}/></button></header>
  <div className={s.photo}><Image src={src} alt={name} fill sizes="(max-width: 768px) 90vw, 720px" unoptimized/></div>
 </dialog>;
}
