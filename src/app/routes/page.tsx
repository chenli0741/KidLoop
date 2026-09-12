import Link from "next/link";
import { openTerm } from "@/lib/operating-terms";
import { TermWorkspace } from "@/components/term-workspace";
import { FixedRouteForm } from "@/components/fixed-route-form";
import { PageHeader } from "@/components/page-header";
import { RosterCreateDialog } from "@/components/roster-controls";
import { requireUser } from "@/lib/auth";
import { getDrivers, getPrograms, getSchools, getVehicles } from "@/lib/data";
import { todayInOperationsTimeZone } from "@/lib/date";
import { db, query } from "@/lib/db";
import { visibleRoutes } from "@/lib/fixed-route-types";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import type { PickupSetting } from "@/lib/pickup-types";
import { readTrialInput, readTrialRange } from "@/lib/schedule-trial-data";
import { ScheduleActions } from "@/components/schedule-actions";

export const dynamic = "force-dynamic";

export default async function RoutesPage() {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  const operation=await openTerm(db);
  if(!operation)return <div className="page-container"><TermWorkspace locale={locale}/></div>;
  const today = todayInOperationsTimeZone();
  const inputPromise = readTrialInput(db, today, today);
  const [input, schools, programs, drivers, vehicles, rules, todayResult] = await Promise.all([
    inputPromise, getSchools(), getPrograms(), getDrivers(), getVehicles(),
    query<PickupSetting & { schoolId: string }>(`select id,name,school_id as "schoolId",grades,weekdays,to_char(pickup_time,'HH24:MI') as "pickupTime",updated_at::text as "updatedAt" from school_pickup_rules where operating_term_id=current_operating_term() order by pickup_time`), readTrialRange(db, [today], true, inputPromise),
  ]);
  const routes=visibleRoutes(input.routes,todayInOperationsTimeZone());
  const formProps = { operatingTermId:operation.id, termStart:operation.startsOn, termEnd:operation.endsOn, schools, programs, drivers, vehicles, students:input.children.map(({id,name,grade,schoolId,programId})=>({id,name:name??"",grade,schoolId,programId})), rules: rules.rows, today: todayInOperationsTimeZone(), locale, batches:input.batches };
  const weekdays = (days: number[]) => days.map(d => (locale === "zh" ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])[d - 1]).join("、");
  const todayPlan = todayResult.days[0];
  return <div className="page-container">
      <TermWorkspace term={operation} locale={locale}/>
    <PageHeader eyebrow={text(locale, "排班", "Scheduling")} title={text(locale, "排班", "Schedule")} description={text(locale, "生成和核对每天的接送安排。", "Generate and review daily pickup schedules.")} />
    <ScheduleActions today={today} />

    <section className="pickup-section schedule-today-section"><div className="section-heading"><div><h2>{text(locale, "今日排班", "Today's schedule")}</h2><p className="form-hint">{today} · {todayPlan?.plans.length ?? 0} {text(locale, "条安排", "plans")}</p></div><Link className="text-link" href={`/schedule/review?date=${today}&view=week`}>{text(locale, "查看核对", "Review")} →</Link></div>
      {todayPlan?.issues.length ? <div className="setup-callout">{text(locale, `有 ${todayPlan.issues.length} 项需要核对。`, `${todayPlan.issues.length} item(s) need review.`)}</div> : null}
      {todayPlan?.plans.length ? <div className="pickup-records">{todayPlan.plans.map(plan => <article className="pickup-record" key={plan.routeId}><div><h3>{plan.name}</h3><p>{plan.stops.map(stop => `${stop.time} · ${stop.name}`).join(" → ")}</p><p>{plan.students.length} {text(locale, "名学生", "students")} · {text(locale, "司机", "Driver")} {drivers.find(driver => driver.id === plan.driverId)?.name ?? "—"} · {text(locale, "车辆", "Vehicle")} {vehicles.find(vehicle => vehicle.id === plan.vehicleId)?.name ?? "—"}</p></div></article>)}</div> : <p className="form-hint">{text(locale, "今天还没有排班，使用上面的生成排班。", "No schedule for today yet. Use Generate schedule above.")}</p>}
    </section>

    <section className="pickup-section">
      <div className="section-heading"><div><h2>{text(locale, "常用线路", "Common route patterns")}</h2><p className="form-hint">{text(locale, "这些是日常排班中常见的线路模式，仅作参考。", "Frequent route patterns from regular schedules, for reference only.")}</p></div><RosterCreateDialog title={text(locale, "添加常用线路", "Add route pattern")} closeLabel={text(locale, "关闭", "Close")}><FixedRouteForm key={routes.length} {...formProps} /></RosterCreateDialog></div>
      {!routes.length && <p>{text(locale, "暂无线路。", "No routes.")}</p>}
      {routes.map(route => <article className="pickup-record" key={route.id}>
        <div><h3>{route.name} · {text(locale,`已选 ${route.students.length} 人`,`${route.students.length} selected`)} · {route.enabled ? text(locale, "已启用", "Enabled") : text(locale, "未启用", "Draft")}</h3>
          <p>{route.routeType==='TEMPORARY'?text(locale,'临时行程','Temporary trip'):text(locale,'固定线路','Recurring route')} · {route.startsOn} — {route.endsOn} · {weekdays(route.weekdays)}</p>
          <p>{drivers.find(d => d.id === route.driverId)?.name ?? text(locale, "司机待绑定", "Driver unassigned")} · {vehicles.find(v => v.id === route.vehicleId)?.name ?? text(locale, "车辆待绑定", "Vehicle unassigned")}</p>
          <p style={{whiteSpace:"pre-line"}}>{route.notes}</p>
          <ol>{route.stops.map(stop => <li key={stop.id}>{stop.time || text(locale,"时间待确认","Time pending")} · {stop.name}</li>)}</ol>
        </div>
        <RosterCreateDialog icon="edit" title={text(locale, "编辑线路", "Edit route")} closeLabel={text(locale, "关闭", "Close")}><FixedRouteForm key={route.updatedAt} initial={route} {...formProps} /></RosterCreateDialog>
      </article>)}
    </section>
  </div>;
}
