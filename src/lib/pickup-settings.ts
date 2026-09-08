import { requireTerm } from "./operating-terms";
import "server-only";
import type { PoolClient } from "pg";
import { PICKUP_GRADES } from "./pickup-grades";
import type {GradeTime} from './pickup-types';

export function parseGradeTimes(raw: string): GradeTime[] {
  let groups: unknown;
  try { groups=JSON.parse(raw); } catch { fail('请填写年级和时间。','Enter grades and times.'); }
  if(!Array.isArray(groups)||!groups.length||groups.length>PICKUP_GRADES.length)fail('请至少添加一组年级和时间。','Add at least one grade/time group.');
  const seen=new Set<string>();
  return groups.map(group=>{
    if(!group||!Array.isArray(group.grades)||!group.grades.length||typeof group.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(group.time))fail('请检查年级和时间。','Check grades and times.');
    for(const grade of group.grades) {
      if(typeof grade!=='string'||!PICKUP_GRADES.includes(grade)||seen.has(grade))fail('同一天每个年级只能设置一个时间。','Each valid grade can have only one time per date.');
      seen.add(grade);
    }
    return {grades:group.grades,time:group.time};
  });
}

export class PickupError extends Error {
  constructor(public zh: string, public en: string) { super(en); }
}
function fail(zh: string, en: string): never { throw new PickupError(zh, en); }
function field(f: FormData, k: string) { return String(f.get(k) ?? "").trim(); }
function name(f: FormData) {
  const n = field(f, "name");
  if (!n || n.length > 160) fail("名称须为 1–160 个字符。", "Use a name of 1–160 characters.");
  return n;
}
function dates(f: FormData) {
  const a = field(f, "startsOn"), b = field(f, "endsOn");
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  if (!valid(a) || !valid(b) || a > b || (Date.parse(b)-Date.parse(a))/86400000 > 550) fail("请填写有效起止日期，范围不超过 550 天。", "Use valid dates spanning at most 550 days.");
  return [a,b];
}
function time(f: FormData) {
  const t = field(f, "pickupTime");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) fail("请填写有效接送时间。", "Enter a valid pickup time.");
  return t;
}
function days(f: FormData) {
  const d = [...new Set(f.getAll("weekdays").map(Number))].sort();
  if (!d.length || d.some(v => !Number.isInteger(v) || v<1 || v>7)) fail("请至少选择一个有效星期。", "Select at least one valid weekday.");
  return d;
}
export async function savePickupSetting(c: PoolClient, f: FormData) {
  const school = field(f,"schoolId"), kind = field(f,"kind"), id = field(f,"id"), remove = field(f,"remove") === "1";
  const operation=await requireTerm(c);
  if(kind==='term' && (!id || remove)) fail("学校学期只能编辑日期。", "School term dates can only be edited.");
  // Serialize all changes for one school, including overlap checks and route edits.
  const locked = await c.query('select calendar_archived_through::text as cutoff from schools where id=$1 for update',[school]);
  if (!locked.rowCount) fail("学校不存在。", "School not found.");
  const cutoff: string | null = locked.rows[0].cutoff;
  const tables: Record<string,string> = {term:"school_terms",exception:"school_calendar_exceptions",rule:"school_pickup_rules",route:"pickup_routes"};
  const table = tables[kind];
  if (!table) fail("设置类型无效。", "Invalid setting type.");
  if (id) {
    const existing = kind === "route"
      ? await c.query("select r.updated_at::text from pickup_routes r join school_pickup_rules p on p.id=r.rule_id where r.id=$1 and p.school_id=$2 and p.operating_term_id=current_operating_term()",[id,school])
      : await c.query(`select updated_at::text${kind === "term" || kind === "exception" ? ', ends_on::text as end' : ''} from ${table} where id=$1 and school_id=$2 and operating_term_id=$3`,[id,school,operation.id]);
    if (!existing.rowCount) fail("该设置不属于当前学校。", "This setting does not belong to this school.");
    if (cutoff && existing.rows[0].end <= cutoff) fail("已存档日期不可修改或删除。", "Archived dates cannot be changed or deleted.");
    if (existing.rows[0].updated_at !== field(f,"updatedAt")) fail("设置已被更新，请刷新后再试。", "Settings changed. Refresh before saving.");
  }
  if (remove) {
    if (!id) fail("请选择要删除的设置。", "Select a setting to remove.");
    if (kind === "rule" && (await c.query("select 1 from pickup_routes where rule_id=$1",[id])).rowCount) fail("请先删除引用这条规则的线路。", "Remove routes that use this rule first.");
    await c.query(`delete from ${table} where id=$1`,[id]);
    return;
  }
  const n = name(f);
  if (kind === "term" || kind === "exception") {
    const [a,b] = dates(f);
    if (kind === "exception" && (a<operation.startsOn || b>operation.endsOn)) fail("日期须在当前运营学期范围内。", "Dates must be within the operating term.");
    if (cutoff && a <= cutoff) fail("日期必须晚于已存档日期。", "Dates must be after the archive cutoff.");
    if ((await c.query(`select 1 from ${table} where operating_term_id=current_operating_term() and school_id=$1 and id<>coalesce($2::uuid,gen_random_uuid()) and starts_on<=$4::date and ends_on>=$3::date`,[school,id||null,a,b])).rowCount) fail("日期与该学校已有设置重叠，请编辑已有记录。", "Dates overlap an existing entry. Edit that entry instead.");
    const t = kind === "exception" && field(f,"exceptionType") === "time" ? time(f) : null;
    const gradeTimes=kind==='exception' && field(f,'exceptionType')==='grades'?parseGradeTimes(field(f,'gradeTimes')):[];
    if(kind==='exception' && !['closed','time','grades'].includes(field(f,'exceptionType')))fail('请选择日期安排。','Select a date arrangement.');
    if (id) await c.query(`update ${table} set name=$2,starts_on=$3,ends_on=$4,updated_at=clock_timestamp()${kind === "exception" ? ",pickup_time=$5,grade_times=$6" : ""} where id=$1`,kind === "exception" ? [id,n,a,b,t,JSON.stringify(gradeTimes)] : [id,n,a,b]);
    else await c.query(`insert into ${table}(school_id,name,starts_on,ends_on${kind === "exception" ? ",pickup_time,grade_times" : ""}) values($1,$2,$3,$4${kind === "exception" ? ",$5,$6" : ""})`,kind === "exception" ? [school,n,a,b,t,JSON.stringify(gradeTimes)] : [school,n,a,b]);
    return;
  }
  const weekdays = days(f);
  if (kind === "rule") {
    const pickupTime = time(f);
    const grades = [...new Set(f.getAll("grades").map(v => String(v).trim()))];
    if (!grades.length || grades.some(g => !PICKUP_GRADES.includes(g))) fail("请选择有效年级：TK、K、1–7。", "Select at least one valid grade: TK, K, 1-7.");
    if ((await c.query(`select 1 from school_pickup_rules p where p.operating_term_id=current_operating_term() and p.school_id=$1 and p.id<>coalesce($2::uuid,gen_random_uuid()) and p.weekdays && $3::integer[] and p.grades && $4::text[]`,[school,id||null,weekdays,grades])).rowCount) fail("所选年级在这些星期已有接送时间，请修改已有规则。", "These grades already have pickup times on these weekdays.");
    if (id && (await c.query("select 1 from pickup_routes where rule_id=$1 and not weekdays <@ $2::integer[]",[id,weekdays])).rowCount) fail("已有线路使用了被移除的星期，请先调整线路。", "Update routes before removing weekdays they use.");
    if (id)
      await c.query("update school_pickup_rules set name=$2,weekdays=$3,pickup_time=$4,grades=$5,updated_at=clock_timestamp() where id=$1 returning id",[id,n,weekdays,pickupTime,grades]);
    else await c.query("insert into school_pickup_rules(school_id,name,weekdays,pickup_time,grades) values($1,$2,$3,$4,$5) returning id",[school,n,weekdays,pickupTime,grades]);
  } else {
    const rule = field(f,"ruleId"), program = field(f,"programId");
    if (!(await c.query("select id from school_pickup_rules where id=$1 and school_id=$2 and operating_term_id=current_operating_term() and $3::integer[] <@ weekdays",[rule,school,weekdays])).rowCount) fail("请选择本校规则，线路星期必须在规则范围内。", "Select this school's rule and a subset of its weekdays.");
    if (!(await c.query("select id from after_school_programs where id=$1",[program])).rowCount) fail("请选择有效目的地。", "Select a valid destination.");
    if (id) await c.query("update pickup_routes set name=$2,rule_id=$3,program_id=$4,weekdays=$5,updated_at=clock_timestamp() where id=$1",[id,n,rule,program,weekdays]);
    else await c.query("insert into pickup_routes(name,rule_id,program_id,weekdays) values($1,$2,$3,$4)",[n,rule,program,weekdays]);
  }
}

export const pickupPreviewSql = `
 select d::date::text as date,r.name as route,p.name as rule,a.name as destination,
        to_char(adjusted.pickup_time,'HH24:MI') as time,
        adjusted.grades as grades
 from school_terms t
 join schools s on s.id=t.school_id
 cross join lateral generate_series(t.starts_on::timestamp,t.ends_on::timestamp,interval '1 day') d
 join school_pickup_rules p on p.school_id=t.school_id
 join pickup_routes r on r.rule_id=p.id and extract(isodow from d)::integer=any(r.weekdays)
 join after_school_programs a on a.id=r.program_id
 left join school_calendar_exceptions e on e.school_id=t.school_id and d::date between e.starts_on and e.ends_on
 cross join lateral (select school_special_pickup_time(e.grade_times,g.grade,e.pickup_time,p.pickup_time) as pickup_time,
   array_agg(g.grade order by g.position) as grades from unnest(p.grades) with ordinality as g(grade,position)
   group by school_special_pickup_time(e.grade_times,g.grade,e.pickup_time,p.pickup_time)) adjusted
 where t.id=$1 and t.school_id=$2 and (e.id is null or e.pickup_time is not null or jsonb_array_length(e.grade_times)>0)
 and (s.calendar_archived_through is null or d::date > s.calendar_archived_through)
 order by d,adjusted.pickup_time,r.name`;

export async function archiveSchoolCalendar(c: PoolClient, f: FormData, today: string) {
  const school = field(f, "schoolId");
  const locked = await c.query('select calendar_archived_through::text as cutoff from schools where id=$1 for update', [school]);
  if (!locked.rowCount) fail("学校不存在。", "School not found.");
  const term = (await c.query('select ends_on::text as end, updated_at::text as version from school_terms where id=$1 and school_id=$2', [field(f, "id"), school])).rows[0];
  if (!term) fail("该学期不属于当前学校。", "Term does not belong to this school.");
  if (term.version !== field(f, "updatedAt")) fail("设置已被更新，请刷新后再试。", "Settings changed. Refresh before archiving.");
  if (term.end >= today) fail("只能存档已经结束的学期。", "Only ended terms can be archived.");
  if (locked.rows[0].cutoff && term.end <= locked.rows[0].cutoff) fail("该学期已存档。", "Term is already archived.");
  // Keep the historical segment and a separately editable future segment.
  await c.query(`insert into school_calendar_exceptions(school_id,name,starts_on,ends_on,pickup_time,grade_times)
    select school_id,name,$2::date+1,ends_on,pickup_time,grade_times from school_calendar_exceptions
    where school_id=$1 and starts_on <= $2::date and ends_on > $2::date`, [school, term.end]);
  await c.query(`update school_calendar_exceptions set ends_on=$2,updated_at=clock_timestamp()
    where school_id=$1 and starts_on <= $2::date and ends_on > $2::date`, [school, term.end]);
  await c.query('update schools set calendar_archived_through=$2,calendar_archived_at=clock_timestamp() where id=$1', [school, term.end]);
}
