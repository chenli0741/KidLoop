import type { FixedRoute } from './fixed-route-types';

export type StudentRouteOption = {
  key: string;
  routeId: string;
  routeName: string;
  schoolId: string;
  programId: string;
  pickupStopId: string;
  dropoffStopId: string;
  pickupTime: string;
  dropoffTime: string;
};

// A repeated school/program stop can yield several valid pairs: never guess the pair.
export function studentRouteOptions(routes: FixedRoute[], today: string): StudentRouteOption[] {
  return routes.filter(r => r.enabled && r.routeType === 'RECURRING' && r.endsOn >= today).flatMap(r =>
    r.stops.flatMap((pickup, index) => !pickup.schoolId ? [] : r.stops.slice(index + 1).flatMap(dropoff =>
      !dropoff.programId ? [] : [{
        key: `${r.id}:${pickup.id}:${dropoff.id}`,
        routeId: r.id, routeName: r.name,
        schoolId: pickup.schoolId!, programId: dropoff.programId,
        pickupStopId: pickup.id, dropoffStopId: dropoff.id,
        pickupTime: pickup.time, dropoffTime: dropoff.time,
      }],
    )),
  );
}
