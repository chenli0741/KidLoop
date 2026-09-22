"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const locale = useLocale();
  const [reference] = useState(() => error.digest ?? `UI-${Math.random().toString(36).slice(2, 10).toUpperCase()}`);
  const [retrying,setRetrying]=useState(false);
  const reloadTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{
    console.error('KidLoop client error',{reference,error});
    void fetch('/api/client-errors',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({reference,message:error.message,stack:error.stack,path:window.location.pathname})}).catch(()=>{});
    return ()=>{if(reloadTimer.current)clearTimeout(reloadTimer.current);};
  },[error,reference]);
  function tryAgain(){
    setRetrying(true);
    try{retry();reloadTimer.current=setTimeout(()=>window.location.reload(),1200);}
    catch{window.location.reload();}
  }
  return (
    <div className="error-page">
      <div>
        <TriangleAlert size={30} />
        <h1>{text(locale, "出现错误", "Something went wrong")}</h1>
        <p>{text(locale, "暂时无法加载，请重试。若仍失败，请将错误编号提供给管理员。", "Unable to load right now. Try again. If it still fails, share the error reference with your administrator.")}</p>
        <p>{text(locale,'错误编号','Error reference')}: {reference}</p>
        <button className="button primary" type="button" disabled={retrying} onClick={tryAgain}>{retrying?text(locale,"正在重新加载…","Reloading…"):text(locale, "重试", "Try again")}</button>
      </div>
    </div>
  );
}
