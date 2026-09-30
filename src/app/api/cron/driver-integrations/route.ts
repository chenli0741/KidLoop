import { dispatchDriverNotifications } from "@/lib/driver-notification-dispatch";
import { syncDriverCalendars } from "@/lib/driver-calendar-sync";
export const runtime="nodejs";export const maxDuration=60;
export async function GET(request:Request){const secret=process.env.CRON_SECRET;if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return new Response("Unauthorized",{status:401});
 const now=new Date(),notifications=await dispatchDriverNotifications(now);let calendars:{connections:number}|null=null;if(now.getUTCMinutes()%15===0)calendars=await syncDriverCalendars();return Response.json({ok:true,notifications,calendars},{headers:{"Cache-Control":"no-store"}});}
