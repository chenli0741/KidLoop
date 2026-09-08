import type { Trip } from "./types";

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
