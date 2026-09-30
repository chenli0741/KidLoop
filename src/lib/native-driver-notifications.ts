import { Capacitor,registerPlugin,type PluginListenerHandle } from "@capacitor/core";
type Registration={status:"authorized"|"denied";token?:string;installationId:string;environment:"sandbox"|"production"};
type Plugin={register():Promise<Registration>;getPendingRoute():Promise<{path?:string}>;addListener(event:"notificationOpened",handler:(event:{path:string})=>void):Promise<PluginListenerHandle>};
const notifications=registerPlugin<Plugin>("KidLoopNotifications");
export const supportsDriverNotifications=()=>Capacitor.getPlatform()==="ios"&&Capacitor.isPluginAvailable("KidLoopNotifications");
export async function registerDriverNotifications(){return notifications.register();}
export async function pendingNotificationRoute(){return notifications.getPendingRoute();}
export async function onNotificationOpened(handler:(path:string)=>void){return notifications.addListener("notificationOpened",event=>handler(event.path));}
