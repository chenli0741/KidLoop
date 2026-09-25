import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSharedPickupStop,
  sharedRidersNeededAtStop,
} from "../src/lib/shared-pickup-progress";

const riders = [
  { shared: true, pickupStopId: "cumberland", status: "PICKED_UP" as const },
  { shared: true, pickupStopId: "cumberland", status: "PICKED_UP" as const },
  { shared: true, pickupStopId: "cumberland", status: "PICKED_UP" as const },
  { shared: true, pickupStopId: "cumberland", status: "PICKED_UP" as const },
  { shared: true, pickupStopId: "cumberland", status: "PICKED_UP" as const },
  { shared: true, pickupStopId: "cumberland", status: "SCHEDULED" as const },
  { shared: true, pickupStopId: "cumberland", status: "PICKED_UP" as const, otherVehicle: "Bus 2" },
];

test("shared minimum applies only at the stop that owns the shared pool", () => {
  assert.equal(isSharedPickupStop(riders, "cumberland"), true);
  assert.equal(sharedRidersNeededAtStop(riders, "cumberland", 7), 2);

  assert.equal(isSharedPickupStop(riders, "cherry-chase"), false);
  assert.equal(sharedRidersNeededAtStop(riders, "cherry-chase", 7), 0);
});
