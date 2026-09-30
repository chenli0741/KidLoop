import { stageDriverCalendar } from "@/lib/driver-calendar";
import { applicationOrigin } from "@/lib/company-mail/config";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store","Referrer-Policy":"no-referrer"};
export async function GET(request:Request){const p=new URL(request.url).searchParams,state=p.get("state")??"";
 try{const result=await stageDriverCalendar(state,p.get("code"),p.has("error"));const destination=new URL(result.native?"kidloop-calendar://complete":`${applicationOrigin()}/driver/week`);destination.searchParams.set("calendar_state",state);destination.searchParams.set(result.ok?"calendar_ready":"calendar_failed","1");return new Response(null,{status:303,headers:{...headers,Location:destination.toString()}});}
 catch{return new Response("Calendar authorization expired. Return to KidLoop and connect again. / 日历授权已失效，请返回 KidLoop 重新连接。",{status:400,headers:{...headers,"Content-Type":"text/plain; charset=utf-8"}});}}
