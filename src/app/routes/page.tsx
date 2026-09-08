import { openTerm } from "@/lib/operating-terms";
import { TermWorkspace } from "@/components/term-workspace";
import { FixedRouteForm } from "@/components/fixed-route-form";
import { PageHeader } from "@/components/page-header";
import { RosterCreateDialog } from "@/components/roster-controls";
import { requireUser } from "@/lib/auth";
import { getDrivers, getPrograms, getSchools, getStudents, getVehicles } from "@/lib/data";
import { todayInOperationsTimeZone } from "@/lib/date";
import { db, query } from "@/lib/db";
import { readFixedRoutes } from "@/lib/fixed-routes";
import { visibleRoutes } from "@/lib/fixed-route-types";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import type { PickupSetting } from "@/lib/pickup-types";

export const dynamic = "force-dynamic";

export default async function RoutesPage() {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  const operation=await openTerm(db);
  if(!operation)return <div className="page-container"><TermWorkspace locale={locale}/></div>;
  const [allRoutes, schools, programs, drivers, vehicles, students, rules] = await Promise.all([
    readFixedRoutes(db), getSchools(), getPrograms(), getDrivers(), getVehicles(), getStudents(),
    query<PickupSetting & { schoolId: string }>(`select id,name,school_id as "schoolId",grades,weekdays,to_char(pickup_time,'HH24:MI') as "pickupTime",updated_at::text as "updatedAt" from school_pickup_rules where operating_term_id=current_operating_term() order by pickup_time`),
  ]);
  const routes=visibleRoutes(allRoutes,todayInOperationsTimeZone());
  const formProps = { operatingTermId:operation.id, termStart:operation.startsOn, termEnd:operation.endsOn, schools, programs, drivers, vehicles, students, rules: rules.rows, today: todayInOperationsTimeZone(), locale };
  const weekdays = (days: number[]) => days.map(d => (locale === "zh" ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])[d - 1]).join("、");
  return <div className="page-container">
      <TermWorkspace term={operation} locale={locale}/>
    <PageHeader eyebrow={text(locale, "线路管理", "Route management")} title={text(locale, "线路", "Routes")} description={text(locale, "固定线路、站点与司机车辆。", "Recurring routes, stops, drivers and vehicles.")} />
    <section className="pickup-section">
      <div className="section-heading"><h2>{text(locale, "接送线路", "Routes")}</h2><RosterCreateDialog title={text(locale, "添加线路", "Add route")} closeLabel={text(locale, "关闭", "Close")}><FixedRouteForm key={routes.length} {...formProps} /></RosterCreateDialog></div>
      {!routes.length && <p>{text(locale, "暂无线路。", "No routes.")}</p>}
      {routes.map(route => <article className="pickup-record" key={route.id}>
        <div><h3>{route.name} · {route.enabled ? text(locale, "已启用", "Enabled") : text(locale, "未启用", "Draft")}</h3>
          <p>{route.routeType==='TEMPORARY'?text(locale,'临时行程','Temporary trip'):text(locale,'固定线路','Recurring route')} · {route.startsOn} — {route.endsOn} · {weekdays(route.weekdays)}</p>
          <p>{drivers.find(d => d.id === route.driverId)?.name ?? text(locale, "司机待绑定", "Driver unassigned")} · {vehicles.find(v => v.id === route.vehicleId)?.name ?? text(locale, "车辆待绑定", "Vehicle unassigned")} · {route.students.length} {text(locale, "名学生", "riders")}</p>
          <ol>{route.stops.map(stop => <li key={stop.id}>{stop.time} · {stop.name}</li>)}</ol>
        </div>
        <RosterCreateDialog icon="edit" title={text(locale, "编辑线路", "Edit route")} closeLabel={text(locale, "关闭", "Close")}><FixedRouteForm key={route.updatedAt} initial={route} {...formProps} /></RosterCreateDialog>
      </article>)}
    </section>
  </div>;
}
