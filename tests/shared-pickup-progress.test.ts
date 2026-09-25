import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSharedPickupStop,
  sharedPickupCanDepart,
  sharedRidersNeededAtStop,
  sharedRidersOverMaximumAtStop,
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
  assert.equal(sharedRidersOverMaximumAtStop(riders, "cumberland", 4), 1);
  assert.equal(sharedRidersOverMaximumAtStop(riders, "cumberland", 5), 0);

  assert.equal(isSharedPickupStop(riders, "cherry-chase"), false);
  assert.equal(sharedRidersNeededAtStop(riders, "cherry-chase", 7), 0);
  assert.equal(sharedRidersOverMaximumAtStop(riders, "cherry-chase", 0), 0);
});

test("GO is available only while this vehicle is within its stored range", () => {
  assert.equal(sharedPickupCanDepart(6, 7, 8), false);
  assert.equal(sharedPickupCanDepart(7, 7, 8), true);
  assert.equal(sharedPickupCanDepart(8, 7, 8), true);
  assert.equal(sharedPickupCanDepart(9, 7, 8), false);
  assert.equal(sharedPickupCanDepart(7, 7, 8, false), false);
});
