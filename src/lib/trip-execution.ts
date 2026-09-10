import type { RiderStatus, Trip, TripStatus } from './types';

export type TripExecution = {
  tripId: string;
  version: string;
  status: TripStatus;
  completedSegments: string[];
  riders: { id: string; status: RiderStatus; missedPickupNote?: string }[];
  currentStopIndex?: number;
  progressState?: "AT_STOP" | "IN_TRANSIT";
};

export function applyTripExecution(trip: Trip, update: TripExecution): Trip {
  if (trip.id !== update.tripId || (trip.executionVersion && trip.executionVersion > update.version)) return trip;
  const riders = new Map(update.riders.map(rider => [rider.id, rider]));
  return { ...trip, executionVersion: update.version, status: update.status, completedSegments: update.completedSegments, currentStopIndex: update.currentStopIndex, progressState: update.progressState,
    riders: trip.riders.map(rider => ({ ...rider, ...riders.get(rider.id) })) };
}
