import "server-only";
import { cache } from "react";
import { transaction } from "./db";
import { materializeRoutes } from "./fixed-routes";
import { todayInOperationsTimeZone } from "./date";
// Recomputed once per request, only after the caller has authenticated.
export const ensureRouteTasks=cache(async(date:string)=>transaction(c=>materializeRoutes(c,date,todayInOperationsTimeZone())));
