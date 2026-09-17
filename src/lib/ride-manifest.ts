import type {Trip} from './types';

export function rideManifest(trip:Trip,role:'ADMIN'|'DRIVER',selectedStopIndex?:number){
 if(trip.status==='COMPLETED')return {mode:'completed' as const,riders:trip.riders};
 if(trip.progressState==='IN_TRANSIT')return {mode:'onboard' as const,riders:trip.riders.filter(r=>r.status==='PICKED_UP'&&!r.otherVehicle)};
 const stop=trip.routeStops?.[selectedStopIndex??trip.currentStopIndex??0];
 return {mode:'stop' as const,riders:(stop?trip.riders.filter(r=>stop.schoolId?r.pickupStopId===stop.id:r.dropoffStopId===stop.id):trip.riders)
  .filter(r=>role!=='DRIVER'||(!r.parentAbsent&&r.status!=='ABSENT'))};
}
