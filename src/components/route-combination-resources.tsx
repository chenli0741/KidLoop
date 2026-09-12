import { Pencil, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { ActionForm } from "@/components/action-form";
import { ResourceDialog } from "@/components/resource-dialog";
import { createRouteCombinationGroup, deleteRouteCombinationGroup, updateRouteCombinationGroup } from "@/app/actions";

type Stop = { id: string; name: string };
type Vehicle = { id: string; name: string; plate: string; capacity: number };
type Group = { id: string; name: string; schools: string[]; programs: string[]; vehicles: string[] };

function stopPicker(locale: "zh" | "en", schools: Stop[], programs: Stop[], vehicles: Vehicle[], group?: Group) {
  const schoolIds = new Set(group?.schools ?? []);
  const programIds = new Set(group?.programs ?? []);
  const vehicleIds = new Set(group?.vehicles ?? []);
  return <>
    {group && <input type="hidden" name="id" value={group.id} />}
    <label><span>{text(locale, "组合名称", "Group name")}</span><input name="name" defaultValue={group?.name} maxLength={160} required placeholder={text(locale, "例如：McAuliffe 到 Morningstar", "e.g. McAuliffe to Morningstar")} /></label>
    <fieldset className="route-combination-picker full"><legend>{text(locale, "选择地点", "Choose stops")}</legend>
      <p className="form-hint">{text(locale, "学校和培训班都可以选择。一个地点可以加入多个组合组。", "Schools and programs can both be selected. A stop may belong to more than one group.")}</p>
      <div className="route-combination-options">
        {schools.map(stop => <label className="route-combination-option" key={stop.id}><input type="checkbox" name="schoolIds" value={stop.id} defaultChecked={schoolIds.has(stop.id)} /><span>{stop.name}</span></label>)}
        {programs.map(stop => <label className="route-combination-option" key={stop.id}><input type="checkbox" name="programIds" value={stop.id} defaultChecked={programIds.has(stop.id)} /><span>{stop.name}</span></label>)}
      </div>
    </fieldset>
    <fieldset className="route-combination-picker full"><legend>{text(locale, "分配车辆", "Assign vehicles")}</legend>
      <p className="form-hint">{text(locale, "排班会根据这些车辆的座位和可用状态计算需要几条线。", "Scheduling uses these vehicles' seats and availability to calculate the number of lines.")}</p>
      <div className="route-combination-options">
        {vehicles.map(vehicle => <label className="route-combination-option" key={vehicle.id}><input type="checkbox" name="vehicleIds" value={vehicle.id} defaultChecked={vehicleIds.has(vehicle.id)} /><span>{vehicle.name} · {vehicle.capacity}{text(locale, "座", " seats")}</span></label>)}
      </div>
    </fieldset>
  </>;
}

export async function RouteCombinationResources() {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  const [schools, programs, vehicles, groups] = await Promise.all([
    query<Stop>("select id,coalesce(short_name,name) as name from schools order by name"),
    query<Stop>("select id,name from after_school_programs order by name"),
    query<Vehicle>("select id,name,plate,capacity from vehicles where active order by name"),
    query<Group & { school_ids: string[]; program_ids: string[]; vehicle_ids: string[] }>(`select g.id,g.name,
      coalesce(array_agg(s.school_id) filter (where s.school_id is not null),'{}') as school_ids,
      coalesce(array_agg(s.program_id) filter (where s.program_id is not null),'{}') as program_ids,
      coalesce((select array_agg(v.vehicle_id) from route_combination_group_vehicles v where v.group_id=g.id),'{}') as vehicle_ids
      from route_combination_groups g left join route_combination_group_stops s on s.group_id=g.id
      group by g.id order by g.name`),
  ]);
  const rows = groups.rows.map(row => ({ id: row.id, name: row.name, schools: row.school_ids, programs: row.program_ids, vehicles: row.vehicle_ids }));
  const names = new Map([...schools.rows, ...programs.rows].map(stop => [stop.id, stop.name]));
  const vehicleNames = new Map(vehicles.rows.map(vehicle => [vehicle.id, `${vehicle.name} · ${vehicle.capacity}${text(locale, "座", " seats")}`]));
  return <section className="content-section resource-list-section"><div className="section-heading"><div><span className="eyebrow">{text(locale, "排班配置", "Scheduling configuration")}</span><h2>{text(locale, "组合规则", "Combination groups")}</h2><p className="form-hint">{text(locale, "设置哪些 Stop 可以放在同一组排班，以及这组可使用的车辆。", "Choose which stops may be scheduled together and which vehicles are available to the group.")}</p></div><div className="resource-heading-actions"><span className="section-count">{rows.length}</span><ResourceDialog title={text(locale, "添加组合组", "Add combination group")}><ActionForm action={createRouteCombinationGroup} submitLabel={text(locale, "保存", "Save")}>{stopPicker(locale, schools.rows, programs.rows, vehicles.rows)}</ActionForm></ResourceDialog></div></div>
    {rows.length ? <div className="resource-rows">{rows.map(row => <article className="resource-row" key={row.id}><div className="resource-row-main"><strong>{row.name}</strong><span>{[...row.schools, ...row.programs].map(id => names.get(id)).filter(Boolean).join(" · ")}</span><span>{text(locale, "车辆", "Vehicles")}: {row.vehicles.map(id => vehicleNames.get(id)).filter(Boolean).join(" · ") || text(locale, "未分配", "None")}</span></div><div className="resource-row-actions"><ResourceDialog title={text(locale, "编辑组合组", "Edit combination group")} trigger={<button type="button" className="icon-button" title={text(locale, "编辑", "Edit")} aria-label={text(locale, "编辑", "Edit")}><Pencil size={16}/></button>}><ActionForm action={updateRouteCombinationGroup} submitLabel={text(locale, "保存", "Save")}>{stopPicker(locale, schools.rows, programs.rows, vehicles.rows, row)}</ActionForm></ResourceDialog><ActionForm action={deleteRouteCombinationGroup} submitLabel="" submitIcon={<Trash2 size={16}/>} submitClassName="icon-only-action" className="inline-action-form"><input type="hidden" name="id" value={row.id}/></ActionForm></div></article>)}</div> : <p className="form-hint">{text(locale, "还没有组合组。", "No combination groups yet.")}</p>}
  </section>;
}
