"use client";
import { useLayoutEffect } from "react";
/** Pin requests to the session that rendered this document, including old browser tabs. */
export function WorkspaceBoundary({contextKey}:{contextKey:string}) {
  useLayoutEffect(()=>{
    const original=window.fetch;
    window.fetch=(input,init)=>{
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
      if(url.origin!==location.origin)return original(input,init);
      const h=new Headers(input instanceof Request?input.headers:undefined);
      new Headers(init?.headers).forEach((v,k)=>h.set(k,v));
      h.set('x-kidloop-workspace',contextKey);
      return original(input,{...init,headers:h});
    };
    const changed=()=>{
      try {if(localStorage.getItem('kidloop-workspace')!==contextKey)location.replace('/login');} catch {}
    };
    try {localStorage.setItem('kidloop-workspace',contextKey);} catch {}
    window.addEventListener('storage',changed);
    window.addEventListener('focus',changed);
    return ()=>{window.fetch=original;window.removeEventListener('storage',changed);window.removeEventListener('focus',changed);};
  },[contextKey]);
  return null;
}
