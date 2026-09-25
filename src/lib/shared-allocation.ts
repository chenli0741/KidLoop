export type SharedVehicleAvailability = { tripId: string; availableSeats: number };

/** Deterministic bounds for a shared pool; no AI or driver ordering is involved. */
export function sharedPickupBounds(total: number, vehicles: SharedVehicleAvailability[]) {
  const safeTotal = Math.max(0, Math.trunc(total));
  const capacities = vehicles.map(vehicle => Math.max(0, Math.trunc(vehicle.availableSeats)));
  return {
    feasible: capacities.reduce((sum, capacity) => sum + capacity, 0) >= safeTotal,
    vehicles: vehicles.map((vehicle, index) => ({
      tripId: vehicle.tripId,
      min: Math.max(0, safeTotal - capacities.reduce((sum, capacity, other) => sum + (other === index ? 0 : capacity), 0)),
      max: Math.min(safeTotal, capacities[index]),
    })),
  };
}

