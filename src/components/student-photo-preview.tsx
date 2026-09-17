'use client';
import Image from 'next/image';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,ChevronLeft,ChevronRight,UsersRound} from 'lucide-react';
import {text,type Locale} from '@/lib/i18n';
import s from './student-photo-preview.module.css';

type StudentPreview={id:string;name:string;photoUrl:string;classroomName:string;grade:string;age:number|null};
export function StudentPhotoPreview({src,name,locale,sizes='80px',students,studentId}:{src:string;name:string;locale:Locale;sizes?:string;students?:StudentPreview[];studentId?:string}) {
 const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null);
 function close(){setOpen(false);trigger.current?.focus();}
 return <>
  <button ref={trigger} type="button" className={s.trigger} onClick={()=>setOpen(true)} aria-haspopup="dialog" aria-label={text(locale,`查看 ${name} 的照片`,`View ${name}'s photo`)}>
   {src?<Image src={src} alt={name} fill sizes={sizes} unoptimized={src.startsWith('/api/')}/>:<UsersRound size={28} aria-label={text(locale,'照片待补充','Photo pending')}/>}
  </button>
  {open&&createPortal(<PhotoDialog src={src} name={name} locale={locale} close={close} students={students} studentId={studentId}/>,document.body)}
 </>;
}
function PhotoDialog({src,name,locale,close,students,studentId}:{src:string;name:string;locale:Locale;close:()=>void;students?:StudentPreview[];studentId?:string}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [selectedId,setSelectedId]=useState(studentId);
 const touch=useRef<{x:number;y:number}|null>(null);
 const index=Math.max(0,students?.findIndex(student=>student.id===selectedId)??0);
 const student=students?.[index];
 const currentName=student?.name??name,currentSrc=student?.photoUrl??src;
 const total=students?.length??1;
 function move(delta:number){const next=students?.[index+delta];if(next)setSelectedId(next.id);}
 useEffect(()=>{dialog.current?.showModal();},[]);
 function dismiss(){dialog.current?.close();close();}
 return <dialog ref={dialog} className={s.dialog} aria-label={text(locale,`${currentName} 的照片`,`${currentName}'s photo`)} onCancel={e=>{e.preventDefault();dismiss();}} onClick={e=>{if(e.target===e.currentTarget)dismiss();}} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}}}>
  <header className={s.header}><div className={s.identity} aria-live="polite"><strong>{currentName}</strong>{student&&<p>{text(locale,'班级','Class')}: {student.classroomName||text(locale,'待补充','Not recorded')} · {text(locale,'年级','Grade')}: {student.grade||text(locale,'待补充','Not recorded')} · {text(locale,'年龄','Age')}: {student.age===null?text(locale,'待补充','Not recorded'):text(locale,`${student.age} 岁`,`${student.age} years`)}</p>}</div><button type="button" className={s.close} onClick={dismiss} aria-label={text(locale,'关闭','Close')} title={text(locale,'关闭','Close')}><X size={22}/></button></header>
  <div className={`${s.photo} ${student?s.galleryPhoto:''}`} onTouchStart={e=>{touch.current=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;}} onTouchCancel={()=>{touch.current=null;}} onTouchEnd={e=>{const start=touch.current;touch.current=null;if(!start||e.touches.length||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)move(dx<0?1:-1);}}>
   {currentSrc?<Image key={student?.id??currentSrc} src={currentSrc} alt={currentName} fill sizes="(max-width: 768px) 90vw, 720px" unoptimized/>:<div className={s.placeholder}><UsersRound size={96}/><p>{text(locale,'照片待补充','Photo pending')}</p></div>}
  </div>
  {student&&<nav className={s.paging} aria-label={text(locale,'浏览学生','Browse students')}><button type="button" className={s.close} disabled={index===0} onClick={()=>move(-1)} aria-label={text(locale,'上一位学生','Previous student')}><ChevronLeft size={24}/></button><span aria-live="polite">{index+1} / {total}</span><button type="button" className={s.close} disabled={index>=total-1} onClick={()=>move(1)} aria-label={text(locale,'下一位学生','Next student')}><ChevronRight size={24}/></button></nav>}
 </dialog>;
}
