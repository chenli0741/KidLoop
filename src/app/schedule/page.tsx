import { redirect } from "next/navigation";
import { readFixedRoutes } from "@/lib/fixed-routes";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db, query } from "@/lib/db";
import { getPrograms, getSchools, getStudents } from "@/lib/data";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { todayInOperationsTimeZone } from "@/lib/date";
import { PickupCalendar } from "@/components/pickup-calendar";
import type { PickupSetting, SettingKind } from "@/lib/pickup-types";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RosterCreateDialog, SchoolFilter } from "@/components/roster-controls";
import { PickupSettingForm } from "@/components/pickup-setting-form";

export const dynamic = "force-dynamic";
export default async function SchedulePage({ searchParams }: {searchParams:Promise<{school?:string;tab?:string;term?:string}>}) {
  await requireUser(["ADMIN"]);
  const locale=await getLocale(), params=await searchParams;
  if (params.tab === "routes") redirect("/routes");
  const [schools,programs]=await Promise.all([getSchools(),getPrograms()]);
  const fixedRoutes=await readFixedRoutes(db);
  const students=await getStudents();
  const school=schools.find(s=>s.id===params.school) ?? schools[0];
  const tab=params.tab==="preview" ? params.tab : "school";
  const schoolId=school?.id ?? null;
  const [termsResult,exceptionsResult,rulesResult]=await Promise.all([
    query<PickupSetting>('select id,name,starts_on::text as "startsOn",ends_on::text as "endsOn",updated_at::text as "updatedAt" from school_terms where school_id=$1 order by starts_on desc',[schoolId]),
    query<PickupSetting>('select id,name,starts_on::text as "startsOn",ends_on::text as "endsOn",to_char(pickup_time,\'HH24:MI\') as "pickupTime",updated_at::text as "updatedAt" from school_calendar_exceptions where school_id=$1 order by starts_on',[schoolId]),
    query<PickupSetting>(`select p.id,p.name,p.weekdays,to_char(p.pickup_time,'HH24:MI') as "pickupTime",p.updated_at::text as "updatedAt", p.grades from school_pickup_rules p where p.school_id=$1 order by p.pickup_time,p.name`,[schoolId]),

  ]);
  const terms=termsResult.rows, exceptions=exceptionsResult.rows, rules=rulesResult.rows;
  const studentGrades = schoolId ? (await query<{grade:string}>("select distinct trim(s.grade) as grade from students s join classrooms c on c.id=s.classroom_id where c.school_id=$1 and trim(s.grade)<>''", [schoolId])).rows.map(r=>r.grade) : [];
  const grades = [...new Set(["TK", "K", ...Array.from({length:12},(_,i)=>String(i+1)), ...studentGrades, ...rules.flatMap(r=>r.grades ?? [])])];
  const routes:PickupSetting[]=fixedRoutes.filter(r=>r.enabled).flatMap(r=>rules.flatMap(rule=>r.stops.filter(stop=>stop.schoolId===schoolId).flatMap(stop=>{
    const members=r.students.filter(a=>{const student=students.find(s=>s.id===a.studentId);return a.pickupStopId===stop.id && student?.schoolId===schoolId && rule.grades?.includes(student.grade);});
    if(!members.length)return [];
    return [{id:`${r.id}-${stop.id}-${rule.id}`,name:r.name,updatedAt:r.updatedAt,ruleId:rule.id,weekdays:r.weekdays,startsOn:r.startsOn,endsOn:r.endsOn,pickupTime:stop.time,destination:[...new Set(members.map(a=>r.stops.find(s=>s.id===a.dropoffStopId)?.name))].join("、")}];
  })));
  const today=todayInOperationsTimeZone();
  const weekdays=(days?:number[])=>days?.map(d=>(locale==="zh" ? ["周一","周二","周三","周四","周五","周六","周日"] : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"])[d-1]).join("、");
  const form=(kind:SettingKind, initial?:PickupSetting, remove=false)=><PickupSettingForm kind={kind} schoolId={school!.id} locale={locale} initial={initial} remove={remove} rules={rules} programs={programs} grades={grades} />;
  const section=(kind:SettingKind,title:string,description:string,items:PickupSetting[],ready=true)=><section className="pickup-section">
    <div className="section-heading"><div><h2>{title}</h2><p className="form-hint">{description}</p></div>{ready && <RosterCreateDialog title={text(locale,"添加","Add")} closeLabel={text(locale,"关闭","Close")}>{form(kind)}</RosterCreateDialog>}</div>
    {!ready && <p className="setup-callout">{text(locale,"请先设置年级接送时间，并在资料中添加课外班目的地。","Set grade pickup times and add an after-school destination in Resources first.")}</p>}
    {!items.length ? <p className="form-hint">{text(locale,"尚未设置","Not configured yet")}</p> : <div className="pickup-records">{items.map(item=><article className="pickup-record" key={item.id}><div><h3>{item.name}</h3>
      {(kind==="term" || kind==="exception") && <p>{item.startsOn} — {item.endsOn}{kind==="exception" && ` · ${item.pickupTime ?? text(locale,"不接送","No pickup")}`}</p>}
      {kind==="rule" && <><p>{item.grades?.join("、") || text(locale,"请选择适用年级","Select applicable grades")}</p><p>{weekdays(item.weekdays)} · <strong>{item.pickupTime}</strong></p></>}
      {kind==="route" && <><p>{school?.name} → {item.destination}</p><p>{item.ruleName} · {weekdays(item.weekdays)} · {item.pickupTime}</p></>}
    </div><div className="pickup-record-actions"><RosterCreateDialog icon="edit" title={text(locale,"编辑","Edit")} closeLabel={text(locale,"关闭","Close")}>{form(kind,item)}</RosterCreateDialog><RosterCreateDialog icon="remove" title={text(locale,"删除","Remove")} closeLabel={text(locale,"关闭","Close")}>{form(kind,item,true)}</RosterCreateDialog></div></article>)}</div>}
  </section>;
  return <div className="page-container"><PageHeader eyebrow={text(locale,"学期安排","Term planning")} title={text(locale,"规则","Rules")} description={text(locale,"学校学期、假期与接送时间。","School terms, holidays and pickup times.")} />
    {!school ? <EmptyState title={text(locale,"请先添加学校","Add a school first")} body={text(locale,"学校日历和接送规则将保存在学校下面。","Calendars and pickup rules belong to each school.")} href="/resources?tab=schools" action={text(locale,"添加学校","Add school")} /> : <>
      <nav className="resource-tabs school-tabs" aria-label={text(locale,"学校设置分类","School setting categories")}>{[["school",text(locale,"规则","Rules")],["preview",text(locale,"接送日历","Calendar")]].map(([id,label])=><Link key={id} href={`/schedule?school=${school.id}&tab=${id}`} aria-current={tab===id ? "page" : undefined}>{label}</Link>)}</nav>
      <div className="pickup-school-picker"><SchoolFilter schools={schools} selected={school.id} label={text(locale,"学校","School")} page="/schedule" tab={tab} /></div>
      {tab==="school" && <>
        {section("term",text(locale,"学期日历","School terms"),text(locale,"设置开学、结束日期。每所学校维护自己的日历。","Set start and end dates. Each school has its own calendar."),terms)}
        {section("exception",text(locale,"假期与特殊日期","Holidays & exceptions"),text(locale,"日期范围包含首尾两天；可设置停课或全校临时接送时间。特殊时间只覆盖原本有接送的日期。","Date ranges are inclusive. Set closures or school-wide time changes on regular pickup days."),exceptions)}
        {section("rule",text(locale,"年级接送时间","Grade pickup times"),text(locale,"相同时间的年级可合并设置；周三等不同时间另建一条规则。","Group grades sharing a time. Add a separate rule for weekdays with different times."),rules)}
      </>}
      {tab==="preview" && school && <PickupCalendar key={school.id} today={today} terms={terms} exceptions={exceptions} rules={rules} routes={routes} locale={locale} />}
    </>}
  </div>;
}
