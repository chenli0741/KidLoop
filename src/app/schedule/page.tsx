import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getClassrooms, getPrograms, getSchools } from "@/lib/data";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { todayInOperationsTimeZone } from "@/lib/date";
import { pickupPreviewSql } from "@/lib/pickup-settings";
import type { PickupSetting, SettingKind } from "@/lib/pickup-types";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RosterCreateDialog } from "@/components/roster-controls";
import { PickupSettingForm } from "@/components/pickup-setting-form";

export const dynamic = "force-dynamic";
export default async function SchedulePage({ searchParams }: {searchParams:Promise<{school?:string;tab?:string;term?:string}>}) {
  await requireUser(["ADMIN"]);
  const locale=await getLocale(), params=await searchParams;
  const [schools,classrooms,programs]=await Promise.all([getSchools(),getClassrooms(),getPrograms()]);
  const school=schools.find(s=>s.id===params.school) ?? schools[0];
  const tab=params.tab==="routes" || params.tab==="preview" ? params.tab : "school";
  const schoolId=school?.id ?? null;
  const [termsResult,exceptionsResult,rulesResult,routesResult]=await Promise.all([
    query<PickupSetting>('select id,name,starts_on::text as "startsOn",ends_on::text as "endsOn",updated_at::text as "updatedAt" from school_terms where school_id=$1 order by starts_on desc',[schoolId]),
    query<PickupSetting>('select id,name,starts_on::text as "startsOn",ends_on::text as "endsOn",to_char(pickup_time,\'HH24:MI\') as "pickupTime",updated_at::text as "updatedAt" from school_calendar_exceptions where school_id=$1 order by starts_on',[schoolId]),
    query<PickupSetting>(`select p.id,p.name,p.weekdays,to_char(p.pickup_time,'HH24:MI') as "pickupTime",p.updated_at::text as "updatedAt", array_agg(c.id order by c.name) as "classroomIds",string_agg(c.name,', ' order by c.name) as "classNames" from school_pickup_rules p join school_pickup_rule_classes pc on pc.rule_id=p.id join classrooms c on c.id=pc.classroom_id where p.school_id=$1 group by p.id order by p.pickup_time,p.name`,[schoolId]),
    query<PickupSetting>(`select r.id,r.name,r.weekdays,r.rule_id as "ruleId",r.program_id as "programId",r.updated_at::text as "updatedAt",p.name as "ruleName",to_char(p.pickup_time,'HH24:MI') as "pickupTime",a.name as destination from pickup_routes r join school_pickup_rules p on p.id=r.rule_id join after_school_programs a on a.id=r.program_id where p.school_id=$1 order by r.name`,[schoolId]),
  ]);
  const terms=termsResult.rows, exceptions=exceptionsResult.rows, rules=rulesResult.rows, routes=routesResult.rows;
  const today=todayInOperationsTimeZone();
  const term=terms.find(t=>t.id===params.term) ?? terms.find(t=>t.startsOn!<=today && t.endsOn!>=today) ?? terms[0];
  const preview=tab==="preview" && term ? (await query<{date:string;route:string;rule:string;destination:string;time:string;classes:string}>(pickupPreviewSql,[term.id,schoolId])).rows : [];
  const weekdays=(days?:number[])=>days?.map(d=>(locale==="zh" ? ["周一","周二","周三","周四","周五","周六","周日"] : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"])[d-1]).join("、");
  const form=(kind:SettingKind, initial?:PickupSetting, remove=false)=><PickupSettingForm kind={kind} schoolId={school!.id} locale={locale} initial={initial} remove={remove} rules={rules} programs={programs} classrooms={classrooms.filter(c=>c.schoolId===schoolId)} />;
  const section=(kind:SettingKind,title:string,description:string,items:PickupSetting[],ready=true)=><section className="pickup-section">
    <div className="section-heading"><div><h2>{title}</h2><p className="form-hint">{description}</p></div>{ready && <RosterCreateDialog title={text(locale,"添加","Add")} closeLabel={text(locale,"关闭","Close")}>{form(kind)}</RosterCreateDialog>}</div>
    {!ready && <p className="setup-callout">{kind==="rule" ? text(locale,"请先在学生页为当前学校添加班级。","Add classes for this school on the Students page first.") : text(locale,"请先设置班级接送时间，并在资料中添加课外班目的地。","Set class pickup times and add an after-school destination in Resources first.")}</p>}
    {!items.length ? <p className="form-hint">{text(locale,"尚未设置","Not configured yet")}</p> : <div className="pickup-records">{items.map(item=><article className="pickup-record" key={item.id}><div><h3>{item.name}</h3>
      {(kind==="term" || kind==="exception") && <p>{item.startsOn} — {item.endsOn}{kind==="exception" && ` · ${item.pickupTime ?? text(locale,"不接送","No pickup")}`}</p>}
      {kind==="rule" && <><p>{item.classNames}</p><p>{weekdays(item.weekdays)} · <strong>{item.pickupTime}</strong></p></>}
      {kind==="route" && <><p>{school?.name} → {item.destination}</p><p>{item.ruleName} · {weekdays(item.weekdays)} · {item.pickupTime}</p></>}
    </div><div className="pickup-record-actions"><RosterCreateDialog icon="edit" title={text(locale,"编辑","Edit")} closeLabel={text(locale,"关闭","Close")}>{form(kind,item)}</RosterCreateDialog><RosterCreateDialog icon="remove" title={text(locale,"删除","Remove")} closeLabel={text(locale,"关闭","Close")}>{form(kind,item,true)}</RosterCreateDialog></div></article>)}</div>}
  </section>;
  return <div className="page-container"><PageHeader eyebrow={text(locale,"学期安排","Term planning")} title={text(locale,"接送设置","Pickup settings")} description={text(locale,"先设置学校日历和班级接送时间，再为同一学校添加不同目的地的线路。","Set the school calendar and class pickup times, then add routes to different destinations.")} actions={<Link className="text-link" href="/schedule/dispatch">{text(locale,"当天调度","Daily dispatch")} →</Link>} />
    {!school ? <EmptyState title={text(locale,"请先添加学校","Add a school first")} body={text(locale,"学校日历和接送规则将保存在学校下面。","Calendars and pickup rules belong to each school.")} href="/resources?tab=schools" action={text(locale,"添加学校","Add school")} /> : <>
      <form method="get" className="pickup-school-picker"><input type="hidden" name="tab" value={tab} /><label><span>{text(locale,"学校","School")}</span><select name="school" defaultValue={school.id}>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className="button secondary">{text(locale,"查看","View")}</button></form>
      <nav className="resource-tabs" aria-label={text(locale,"接送设置分类","Pickup setting categories")}>{[["school",text(locale,"学校规则","School rules")],["routes",text(locale,"接送线路","Routes")],["preview",text(locale,"日程预览","Preview")]].map(([id,label])=><Link key={id} href={`/schedule?school=${school.id}&tab=${id}`} aria-current={tab===id ? "page" : undefined}>{label}</Link>)}</nav>
      {tab==="school" && <>
        {section("term",text(locale,"学期日历","School terms"),text(locale,"设置开学、结束日期。每所学校维护自己的日历。","Set start and end dates. Each school has its own calendar."),terms)}
        {section("exception",text(locale,"假期与特殊日期","Holidays & exceptions"),text(locale,"日期范围包含首尾两天；可设置停课或全校临时接送时间。特殊时间只覆盖原本有接送的日期。","Date ranges are inclusive. Set closures or school-wide time changes on regular pickup days."),exceptions)}
        {section("rule",text(locale,"班级接送时间","Class pickup times"),text(locale,"相同时间的班级可合并设置；周三等不同时间另建一条规则。","Group classes sharing a time. Add a separate rule for weekdays with different times."),rules,classrooms.some(c=>c.schoolId===school.id))}
      </>}
      {tab==="routes" && section("route",text(locale,"学校 → 课外班","School → after-school destination"),text(locale,"每条线路引用一条学校接送规则。相同规则可用于多个目的地，日历和时间自动沿用。","Each route references a school rule. Reuse it for multiple destinations with the same calendar and times."),routes,rules.length>0 && programs.length>0)}
      {tab==="preview" && <section className="pickup-section"><form method="get" className="pickup-school-picker"><input type="hidden" name="school" value={school.id} /><input type="hidden" name="tab" value="preview" /><label><span>{text(locale,"学期","Term")}</span><select name="term" defaultValue={term?.id}>{terms.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label><button disabled={!term} className="button secondary">{text(locale,"查看","View")}</button></form>
        <h2>{new Set(preview.map(p=>p.date)).size} {text(locale,"个接送日","pickup days")} · {preview.length} {text(locale,"条日程","scheduled pickups")}</h2>
        <p className="form-hint">{text(locale,"按学校日历和线路实时计算；这里是计划预览，尚未发布为实际行程。","Calculated from school calendars and routes. This is a plan preview, not published trips.")}</p>
        {!preview.length ? <p>{text(locale,"请检查学期、班级接送时间和线路是否已设置。","Check that a term, pickup rules, and routes are configured.")}</p> : <div className="pickup-preview"><table><thead><tr>{[text(locale,"日期","Date"),text(locale,"接送时间","Time"),text(locale,"线路／目的地","Route / destination"),text(locale,"班级","Classes")].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{preview.map((p,i)=><tr key={i}><td>{p.date}</td><td>{p.time}</td><td>{p.route}<small>{school.name} → {p.destination}</small></td><td>{p.classes}</td></tr>)}</tbody></table></div>}
      </section>}
    </>}
  </div>;
}
