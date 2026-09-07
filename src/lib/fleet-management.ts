import type { PoolClient } from "pg";

export class FleetEditError extends Error {}
export type FleetKind = "vehicle" | "driver";

function field(form: FormData, name: string, max = 200) {
  const value = form.get(name);
  if (typeof value !== "string" || value.length > max) throw new FleetEditError("invalid");
  return value.trim();
}

export async function changeFleetRecord(client: PoolClient, kind: FleetKind, form: FormData, deleting: boolean) {
  const table = kind === "vehicle" ? "vehicles" : "drivers";
  const column = kind === "vehicle" ? "vehicle_id" : "driver_id";
  const id = field(form, "id");
  const version = field(form, "updatedAt");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !version || Number.isNaN(Date.parse(version))) throw new FleetEditError("invalid");
  const current = await client.query<{ fresh: boolean; status: string }>(
    `select updated_at=$2::timestamptz as fresh,status from ${table} where id=$1 and active for update`, [id, version]);
  if (!current.rowCount) throw new FleetEditError("missing");
  if (!current.rows[0].fresh) throw new FleetEditError("stale");
  const status = deleting ? current.rows[0].status : field(form, "status");
  const statuses = kind === "vehicle" ? ["AVAILABLE", "IN_SERVICE", "MAINTENANCE"] : ["AVAILABLE", "OFF_DUTY"];
  if (!statuses.includes(status)) throw new FleetEditError("invalid");
  if (deleting || (status !== current.rows[0].status && ["MAINTENANCE", "OFF_DUTY"].includes(status))) {
    const assigned = await client.query(`select sh.id from driver_shifts sh where sh.${column}=$1
      and (sh.status='ACTIVE' or (sh.status='SCHEDULED' and sh.shift_date >= (now() at time zone 'America/Los_Angeles')::date)
        or exists (select 1 from trips t where t.shift_id=sh.id and t.status not in ('COMPLETED','CANCELED'))) limit 1`, [id]);
    if (assigned.rowCount) throw new FleetEditError("assigned");
  }
  if (deleting) {
    await client.query(`update ${table} set active=false,updated_at=clock_timestamp() where id=$1`, [id]);
    if (kind === "driver") await client.query("update app_users set active=false where driver_id=$1", [id]);
    return;
  }
  const name = field(form, "name");
  if (!name) throw new FleetEditError("invalid");
  if (kind === "vehicle") {
    const plate = field(form, "plate", 30).toUpperCase();
    const rawCapacity = field(form, "capacity", 3);
    const capacity = Number(rawCapacity);
    if (!plate || !/^\d+$/.test(rawCapacity) || capacity < 1 || capacity > 100) throw new FleetEditError("capacity");
    const full = await client.query(`select t.id from trips t join driver_shifts sh on sh.id=t.shift_id
      join trip_students ts on ts.trip_id=t.id where sh.vehicle_id=$1 and t.status not in ('COMPLETED','CANCELED')
      group by t.id having count(ts.id)>$2 limit 1`, [id, capacity]);
    if (full.rowCount) throw new FleetEditError("seats");
    await client.query("update vehicles set name=$2,plate=$3,capacity=$4,status=$5,updated_at=clock_timestamp() where id=$1", [id, name, plate, capacity, status]);
  } else {
    await client.query("update drivers set name=$2,phone=$3,status=$4,updated_at=clock_timestamp() where id=$1", [id, name, field(form, "phone", 80), status]);
  }
}
