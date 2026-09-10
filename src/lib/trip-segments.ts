import type { Trip } from "./types";

/** @deprecated The driver UI no longer uses paired segments. Kept for old read-only tests/imports. */
export function tripSegments(trip: Trip): Trip[] { return [trip]; }
