import type { Rider } from "@/lib/types";

type SharedPickupRider = Pick<
  Rider,
  "shared" | "otherVehicle" | "pickupStopId" | "status"
>;

export function isSharedPickupStop(
  riders: readonly SharedPickupRider[],
  stopId: string | undefined,
) {
  return Boolean(
    stopId && riders.some((rider) => rider.shared && rider.pickupStopId === stopId),
  );
}

export function sharedRidersNeededAtStop(
  riders: readonly SharedPickupRider[],
  stopId: string | undefined,
  minimum: number,
) {
  if (!isSharedPickupStop(riders, stopId)) return 0;
  const picked = sharedRidersPickedAtStop(riders, stopId);
  return Math.max(0, minimum - picked);
}

export function sharedRidersPickedAtStop(
  riders: readonly SharedPickupRider[],
  stopId: string | undefined,
) {
  if (!stopId) return 0;
  return riders.filter(
    (rider) =>
      rider.shared &&
      !rider.otherVehicle &&
      rider.pickupStopId === stopId &&
      (rider.status === "PICKED_UP" || rider.status === "DROPPED_OFF"),
  ).length;
}

export function sharedRidersOverMaximumAtStop(
  riders: readonly SharedPickupRider[],
  stopId: string | undefined,
  maximum: number,
) {
  if (!isSharedPickupStop(riders, stopId)) return 0;
  return Math.max(0, sharedRidersPickedAtStop(riders, stopId) - maximum);
}

export function sharedPickupCanDepart(
  picked: number,
  minimum: number,
  maximum: number,
  feasible = true,
) {
  return feasible && picked >= minimum && picked <= maximum;
}
