import type { Trip } from "./types";

export function nearestTripSegment(segments: Trip[], now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const value = (type:string) => parts.find(p=>p.type===type)!.value;
  const localNow = Date.parse(`${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:00Z`);
  let nearest=0, distance=Infinity;
  segments.forEach((segment,index)=>{
    const time=Date.parse(`${segment.scheduledDate}T${segment.departureTime.slice(0,5)}:00Z`);
    const delta=Math.abs(time-localNow);
    if(delta<distance){distance=delta;nearest=index;}
  });
  return nearest;
}

export function tripSegments(trip: Trip): Trip[] {
  const stops = trip.routeStops;
  if (!stops?.length || !trip.riders.length) return [trip];
  const groups = new Map<string, Trip>();
  for (const rider of trip.riders) {
    const from = stops.findIndex(s => s.id === rider.pickupStopId);
    const to = stops.findIndex(s => s.id === rider.dropoffStopId);
    // Incomplete historical assignments keep the original manifest intact.
    if (from < 0 || to <= from) return [trip];
    const key = `${from}:${to}`;
    if (!groups.has(key)) groups.set(key, {
      ...trip, routeName: `${stops[from].name} → ${stops[to].name}`,
      routeStops: [stops[from], stops[to]], departureTime: stops[from].time, riders: [],
    });
    groups.get(key)!.riders.push(rider);
  }
  return [...groups.values()].sort((a,b) =>
    stops.findIndex(s=>s.id===a.routeStops![0].id)-stops.findIndex(s=>s.id===b.routeStops![0].id) ||
    stops.findIndex(s=>s.id===a.routeStops![1].id)-stops.findIndex(s=>s.id===b.routeStops![1].id));
}
