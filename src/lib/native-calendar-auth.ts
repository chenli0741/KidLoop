import { Capacitor,registerPlugin } from "@capacitor/core";
const auth=registerPlugin<{authorize(options:{url:string}):Promise<{url:string}>}>("KidLoopCalendarAuth");
export const isNativeCalendar=()=>Capacitor.isNativePlatform();
export const supportsNativeCalendar=()=>Capacitor.getPlatform()==="ios"&&Capacitor.isPluginAvailable("KidLoopCalendarAuth");
export async function authorizeNativeCalendar(url:string,state:string){const result=new URL((await auth.authorize({url})).url);if(result.protocol!=="kidloop-calendar:"||result.hostname!=="complete"||result.searchParams.get("calendar_state")!==state||result.searchParams.has("calendar_failed"))throw new Error("AUTH_CANCELLED");}
