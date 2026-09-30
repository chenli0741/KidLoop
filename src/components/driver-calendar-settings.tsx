"use client";
import { CalendarPlus,RefreshCw,Unlink } from "lucide-react";
import { useEffect,useState } from "react";
import { useRouter } from "next/navigation";
import { connectDriverCalendar,completeDriverCalendar,disconnectCalendar,syncCalendarNow } from "@/app/driver/week/calendar-actions";
import { authorizeNativeCalendar,isNativeCalendar,supportsNativeCalendar } from "@/lib/native-calendar-auth";
import { useLocale } from "./locale-provider";
import { text } from "@/lib/i18n";

type Connection={configured:boolean;email:string|null;revision:string|null;status:"CONNECTED"|"RECONNECT"|"DISCONNECTED"};
export function DriverCalendarSettings({connection}:{connection:Connection}){
 const locale=useLocale(),router=useRouter(),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 useEffect(()=>{const url=new URL(window.location.href),state=url.searchParams.get("calendar_state");if(!state)return;
  const proof=sessionStorage.getItem(`calendar-connect:${state}`);sessionStorage.removeItem(`calendar-connect:${state}`);
  url.searchParams.delete("calendar_state");url.searchParams.delete("calendar_ready");url.searchParams.delete("calendar_failed");window.history.replaceState(null,"",url.pathname+url.search);
  const finish=async()=>{await Promise.resolve();if(!proof){setNotice(text(locale,"日历授权无法完成，请重新连接。","Calendar authorization could not be completed. Reconnect."));return;}
   setBusy(true);const result=await completeDriverCalendar(state,proof);setNotice(result.ok?text(locale,`已同步到 ${result.email}。`,`Synced to ${result.email}.`):text(locale,"日历连接失败，请重试。","Calendar connection failed. Try again."));if(result.ok)router.refresh();setBusy(false);};void finish();
 },[locale,router]);
 async function connect(){setBusy(true);setNotice("");try{const native=isNativeCalendar();if(native&&!supportsNativeCalendar())throw new Error("UPDATE_APP");const result=await connectDriverCalendar(native);if(!result.ok)throw new Error(result.error);
   if(native){await authorizeNativeCalendar(result.url,result.state);const completed=await completeDriverCalendar(result.state,result.proof);if(!completed.ok)throw new Error(completed.error);setNotice(text(locale,`已同步到 ${completed.email}。`,`Synced to ${completed.email}.`));router.refresh();}
   else{sessionStorage.setItem(`calendar-connect:${result.state}`,result.proof);window.location.assign(result.url);}
  }catch(error){setNotice(error instanceof Error&&error.message==="UPDATE_APP"?text(locale,"请更新 iPhone App 后再连接 Google 日历。","Update the iPhone app before connecting Google Calendar."):text(locale,"连接未完成，原有日历设置保持不变。","Connection was not completed. Existing calendar settings are unchanged."));}finally{setBusy(false);}}
 async function sync(){setBusy(true);setNotice("");const result=await syncCalendarNow();setNotice(result.ok?text(locale,"Google 日历已更新。","Google Calendar is up to date."):text(locale,"暂时无法同步，请稍后重试。","Unable to sync right now. Try again later."));setBusy(false);}
 async function disconnect(){if(!connection.revision)return;setBusy(true);const result=await disconnectCalendar(connection.revision);setNotice(result.ok?text(locale,"已停止同步；Google 日历中已有的事件会保留。","Sync stopped. Existing Google Calendar events remain."):text(locale,"暂时无法断开，请稍后重试。","Unable to disconnect right now."));if(result.ok)router.refresh();setBusy(false);}
 return <section className="driver-calendar-card" aria-busy={busy}>
  <div><CalendarPlus size={20}/><div><strong>{text(locale,"Google 日历","Google Calendar")}</strong><span>{connection.email??text(locale,"尚未连接","Not connected")}</span></div></div>
  <p>{text(locale,"同步未来五周的个人接送行程；排班调整和取消会自动更新。Google 邮箱不需要与 KidLoop 登录邮箱相同。","Sync your personal rides for the next five weeks. Changes and cancellations update automatically. The Google email can differ from your KidLoop login.")}</p>
  <div className="driver-calendar-actions"><button className="button primary" onClick={connect} disabled={busy||!connection.configured}>{connection.email?text(locale,"更换账号","Change account"):text(locale,"连接 Google 日历","Connect Google Calendar")}</button>
   {connection.status==="CONNECTED"&&<button className="button secondary" onClick={sync} disabled={busy}><RefreshCw size={16}/>{text(locale,"立即同步","Sync now")}</button>}
   {connection.revision&&<button className="button secondary" onClick={disconnect} disabled={busy}><Unlink size={16}/>{text(locale,"断开","Disconnect")}</button>}</div>
  {!connection.configured&&<p role="status">{text(locale,"Google 日历连接尚未配置。","Google Calendar connection is not configured.")}</p>}
  {connection.status==="RECONNECT"&&<p role="status">{text(locale,"Google 授权已失效，请重新连接。","Google authorization expired. Reconnect.")}</p>}
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
