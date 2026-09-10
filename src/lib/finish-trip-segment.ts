import "server-only";
import type { PoolClient } from "pg";
import type { AuthUser } from "./types";
import { advanceTripStopForClient } from "./stop-progress";

/** @deprecated Compatibility wrapper. New writes use ordered Stop progress. */
export async function finishTripSegment(c: PoolClient, user: AuthUser, tripId: string, _pickupId: string, _dropoffId: string, location?: unknown) {
  await advanceTripStopForClient(c, user, tripId, "DROP_OFF", location);
}
