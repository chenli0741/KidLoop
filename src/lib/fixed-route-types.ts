export type RouteStop = { id:string; name:string; address:string; schoolId:string|null; programId:string|null; time:string };
export type RouteStudent = { studentId:string; pickupStopId:string; dropoffStopId:string };
export type FixedRoute = {notes?:string;id:string; name:string; routeType:'RECURRING'|'TEMPORARY'; startsOn:string; endsOn:string; weekdays:number[]; driverId:string|null; vehicleId:string|null; enabled:boolean; updatedAt:string; stops:RouteStop[]; students:RouteStudent[]};

export function visibleRoutes(routes:FixedRoute[],today:string) {
 return routes.filter(route=>route.routeType!=='TEMPORARY'||route.endsOn>=today);
}
