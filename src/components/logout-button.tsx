"use client";
import {useState,type ReactNode} from 'react';

export function LogoutButton({children,className,invitation}:{children:ReactNode;className?:string;invitation?:string}){
 const [pending,setPending]=useState(false);
 return <button type="button" className={className} disabled={pending} onClick={async()=>{
  if(pending)return;setPending(true);
  try{await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});}catch{/* A committed logout can lose its response; the navigation verifies the cookie. */}
  const suffix=invitation&&/^[a-f0-9]{64}$/.test(invitation)?`?invitation=${invitation}`:'';
  window.location.replace(`/login${suffix}`);
 }}>{children}</button>;
}
