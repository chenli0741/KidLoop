import "server-only";
import { cache } from "react";
import { transaction } from "./db";
import { materializeRoutes } from "./fixed-routes";
import { todayInOperationsTimeZone } from "./date";
// Recomputed once per request, only after the caller has authenticated.
const ensureForScope=cache(async(date:string,driverId:string|undefined)=>transaction(c=>materializeRoutes(c,date,todayInOperationsTimeZone(),driverId)));
// React keys by argument count as well as value: normalize (date) and
// (date, undefined), so admin counts and manifest share the same transaction.
export function ensureRouteTasks(date:string,driverId?:string) {
 return ensureForScope(date,driverId);
}
