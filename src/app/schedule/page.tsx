import { openTerm, initializeSchools, requireTerm } from "@/lib/operating-terms";
import { TermWorkspace } from "@/components/term-workspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db, query, transaction } from "@/lib/db";
import { getPrograms, getSchools } from "@/lib/data";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { todayInOperationsTimeZone } from "@/lib/date";
import { PickupCalendar } from "@/components/pickup-calendar";
import type { PickupSetting, SettingKind } from "@/lib/pickup-types";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RosterCreateDialog, SchoolFilter } from "@/components/roster-controls";
import { PickupSettingForm } from "@/components/pickup-setting-form";
import { PICKUP_GRADES } from "@/lib/pickup-grades";
import { formatGradeGroup } from "@/lib/pickup-types";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";
export default async function SchedulePage({ searchParams }: {searchParams:Promise<{school?:string;tab?:string;term?:string}>}) {
  await requireUser(["ADMIN"]);
  const locale=await getLocale(), params=await searchParams;
  const operation=await openTerm(db);
  if(!operation)return <div className="page-container"><TermWorkspace locale={locale}/></div>;
  await transaction(async c=>{await requireTerm(c,operation.id);await initializeSchools(c,operation);});
  if (params.tab === "routes") redirect("/routes");
  const [schools,programs]=await Promise.all([getSchools(),getPrograms()]);
  const school=schools.find(s=>s.id===params.school) ?? schools[0];
  const tab=params.tab==="preview" ? params.tab : "school";
  const schoolId=school?.id ?? null;
  const cutoff = schoolId ? (await query<{cutoff:string|null}>('select calendar_archived_through::text as cutoff from schools where id=$1',[schoolId])).rows[0]?.cutoff ?? null : null;
  const [termsResult,exceptionsResult,rulesResult]=await Promise.all([
    query<PickupSetting>('select id,name,starts_on::text as "startsOn",ends_on::text as "endsOn",updated_at::text as "updatedAt" from school_terms where operating_term_id=current_operating_term() and school_id=$1 and ($2::date is null or ends_on > $2::date) order by starts_on desc',[schoolId,cutoff]),
    query<PickupSetting>('select grade_times as "gradeTimes",id,name,starts_on::text as "startsOn",ends_on::text as "endsOn",to_char(pickup_time,\'HH24:MI\') as "pickupTime",updated_at::text as "updatedAt" from school_calendar_schedules where operating_term_id=current_operating_term() and school_id=$1 and ($2::date is null or ends_on > $2::date) order by starts_on',[schoolId,cutoff]),
    query<PickupSetting>(`select p.id,p.name,p.weekdays,to_char(p.pickup_time,'HH24:MI') as "pickupTime",p.updated_at::text as "updatedAt", p.grades from school_pickup_rules p where p.operating_term_id=current_operating_term() and p.school_id=$1 order by p.pickup_time,p.name`,[schoolId]),

  ]);
  const terms=termsResult.rows, exceptions=exceptionsResult.rows, rules=rulesResult.rows;
  const studentCounts = schoolId ? (await query<{grade:string;count:string}>(`select trim(s.grade) as grade,count(*)::text as count from students s join term_students ts on ts.student_id=s.id and ts.operating_term_id=current_operating_term() where s.active and s.school_id=$1 group by trim(s.grade)`,[schoolId])).rows.reduce<Record<string,number>>((result,row)=>{result[row.grade]=Number(row.count);return result;},{}):{};
  const grades = PICKUP_GRADES;
  const today=todayInOperationsTimeZone();
  const weekdays=(days?:number[])=>days?.map(d=>(locale==="zh" ? ["周一","周二","周三","周四","周五","周六","周日"] : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"])[d-1]).join("、");
  const form=(kind:SettingKind, initial?:PickupSetting, remove=false)=><PickupSettingForm operatingTermId={operation.id} kind={kind} schoolId={school!.id} locale={locale} initial={initial} remove={remove} rules={rules} programs={programs} grades={grades} />;
  const section=(kind:SettingKind,title:string,description:string,items:PickupSetting[],ready=true)=><section className="pickup-section">
    <div className="section-heading"><div><h2>{title}</h2><p className="form-hint">{description}</p></div>{ready && kind!=="term" && <RosterCreateDialog title={text(locale,"添加","Add")} closeLabel={text(locale,"关闭","Close")}>{form(kind)}</RosterCreateDialog>}</div>
    {!ready && <p className="setup-callout">{text(locale,"请先设置年级接送时间，并在资料中添加课外班目的地。","Set grade pickup times and add an after-school destination in Resources first.")}</p>}
    {!items.length ? <p className="form-hint">{text(locale,"尚未设置","Not configured yet")}</p> : <div className="pickup-records">{items.map(item=><article className="pickup-record school-setting-record" key={item.id}><div><h3>{item.name}</h3>
      {(kind==="term" || kind==="exception") && <p>{item.startsOn} — {item.endsOn}{kind==="exception" && ` · ${item.gradeTimes?.length ? text(locale,'按年级设置放学时间','Dismissal times by grade') : item.pickupTime ?? text(locale,"放假／不接送","Holiday / no pickup")}`}</p>}
      {kind==='exception' && item.gradeTimes?.map((group,index)=><p key={index}>{text(locale,'年级','Grades')} {formatGradeGroup(group.grades)} · <strong>{group.time}</strong></p>)}
      {kind==="rule" && <><p>{item.grades?.join("、") || text(locale,"请选择适用年级","Select applicable grades")}</p><p>{weekdays(item.weekdays)} · <strong>{item.pickupTime}</strong></p></>}
      {kind==="route" && <><p>{school?.name} → {item.destination}</p><p>{item.ruleName} · {weekdays(item.weekdays)} · {item.pickupTime}</p></>}
    </div><div className="pickup-record-actions"><RosterCreateDialog iconOnly icon="edit" title={text(locale,"编辑","Edit")} closeLabel={text(locale,"关闭","Close")}>{form(kind,item)}</RosterCreateDialog>{kind!=="term" && <RosterCreateDialog iconOnly icon="remove" title={text(locale,"删除","Remove")} closeLabel={text(locale,"关闭","Close")}>{form(kind,item,true)}</RosterCreateDialog>}

    </div></article>)}</div>}
  </section>;
  return <div className="page-container"><TermWorkspace term={operation} locale={locale}/><div className="school-page-header"><PageHeader eyebrow={text(locale,"学期安排","Term planning")} title={text(locale,"学校","Schools")} description={text(locale,"学校学期、假期与接送时间。","School terms, holidays and pickup times.")} actions={school ? <div className="school-header-picker"><SchoolFilter schools={schools} selected={school.id} label={text(locale,"学校","School")} page="/schedule" tab={tab} /><Link className="button secondary compact" href={`/routes/adjust?mode=rules&school=${school.id}`}><Sparkles size={16}/>{text(locale,"智能调整学校规则","Adjust school rules")}</Link></div> : undefined} /></div>
    {!school ? <EmptyState title={text(locale,"请先添加学校","Add a school first")} body={text(locale,"学校日历和接送规则将保存在学校下面。","Calendars and pickup rules belong to each school.")} href="/resources?tab=schools" action={text(locale,"添加学校","Add school")} /> : <>
      <nav className="resource-tabs school-tabs" aria-label={text(locale,"学校设置分类","School setting categories")}>{[["school",text(locale,"学校","School")],["preview",text(locale,"日历","Calendar")]].map(([id,label])=><Link key={id} href={`/schedule?school=${school.id}&tab=${id}`} aria-current={tab===id ? "page" : undefined}>{label}</Link>)}</nav>
      {tab==="school" && <>
        {section("term",text(locale,"学期日历","School terms"),text(locale,"默认使用运营学期日期；仅在本校不同的情况下编辑。","Dates default to the operating term. Edit only school-specific differences."),terms)}
        {section("exception",text(locale,"学校日历日程","School calendar schedule"),text(locale,"按日期或日期范围记录学校正式安排；年级实际时间直接显示在日程中。未覆盖的年级沿用常规规则。","Record formal school calendar schedules by date or range; show actual grade times directly in each schedule. Grades not covered use the regular rules."),exceptions)}
        {section("rule",text(locale,"年级接送时间","Grade pickup times"),text(locale,"相同时间的年级可合并设置；周三等不同时间另建一条规则。","Group grades sharing a time. Add a separate rule for weekdays with different times."),rules)}
      </>}
      {tab==="preview" && school && <PickupCalendar key={`${school.id}:${cutoff}`} archivedThrough={cutoff} today={today} schoolName={school.name} terms={terms} exceptions={exceptions} rules={rules} studentCounts={studentCounts} locale={locale} />}
    </>}
  </div>;
}
