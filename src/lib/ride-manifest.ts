import type {Rider,Trip} from './types';

export function pickupProgress(riders:Rider[]){
 const eligible=riders.filter(rider=>!rider.otherVehicle&&!['ABSENT','EXCEPTION'].includes(rider.status));
 const pickedUp=eligible.filter(rider=>['PICKED_UP','DROPPED_OFF'].includes(rider.status)).length;
 return {pickedUp,waiting:eligible.length-pickedUp};
}

export function rideManifest(trip:Trip,role:'ADMIN'|'DRIVER',selectedStopIndex?:number){
 if(trip.status==='COMPLETED')return {mode:'completed' as const,riders:trip.riders};
 if(trip.progressState==='IN_TRANSIT')return {mode:'onboard' as const,riders:trip.riders.filter(r=>r.status==='PICKED_UP'&&!r.otherVehicle)};
 const stop=trip.routeStops?.[selectedStopIndex??trip.currentStopIndex??0];
 return {mode:'stop' as const,riders:(stop?trip.riders.filter(r=>stop.schoolId?r.pickupStopId===stop.id:r.dropoffStopId===stop.id):trip.riders)
  .filter(r=>role!=='DRIVER'||(!r.parentAbsent&&r.status!=='ABSENT'))};
}
