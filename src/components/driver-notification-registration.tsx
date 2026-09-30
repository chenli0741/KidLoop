"use client";
import { useEffect,useState } from "react";
import { useRouter } from "next/navigation";
import { onNotificationOpened,pendingNotificationRoute,registerDriverNotifications,supportsDriverNotifications } from "@/lib/native-driver-notifications";
import { useLocale } from "./locale-provider";
import { text } from "@/lib/i18n";

export function DriverNotificationRegistration(){const router=useRouter(),locale=useLocale(),[notice,setNotice]=useState("");
 useEffect(()=>{if(!supportsDriverNotifications())return;let disposed=false,remove:(()=>Promise<void>)|undefined;
  const open=(path:string)=>{if(/^\/driver(?:[/?]|$)/.test(path))router.push(path);};
  (async()=>{try{const listener=await onNotificationOpened(open);remove=()=>listener.remove();const pending=await pendingNotificationRoute();if(pending.path)open(pending.path);
    const registration=await registerDriverNotifications();if(disposed)return;if(registration.status==="denied"){setNotice(text(locale,"请在 iPhone 设置中允许 KidLoop 通知，才能收到行程提醒。","Allow KidLoop notifications in iPhone Settings to receive ride reminders."));return;}
    const response=await fetch("/api/driver/push-device",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(registration)});if(!response.ok)throw new Error();
   }catch{if(!disposed)setNotice(text(locale,"暂时无法启用行程通知，请稍后重新打开 App。","Ride notifications could not be enabled. Reopen the app and try again."));}})();
  return()=>{disposed=true;void remove?.();};
 },[locale,router]);
 return notice?<p className="driver-notification-notice" role="status">{notice}</p>:null;
}
