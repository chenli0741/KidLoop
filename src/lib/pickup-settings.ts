import "server-only";
import type { PoolClient } from "pg";

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
  // Serialize all changes for one school, including overlap checks and route edits.
  if (!(await c.query("select id from schools where id=$1 for update",[school])).rowCount) fail("学校不存在。", "School not found.");
  const tables: Record<string,string> = {term:"school_terms",exception:"school_calendar_exceptions",rule:"school_pickup_rules",route:"pickup_routes"};
  const table = tables[kind];
  if (!table) fail("设置类型无效。", "Invalid setting type.");
  if (id) {
    const existing = kind === "route"
      ? await c.query("select r.updated_at::text from pickup_routes r join school_pickup_rules p on p.id=r.rule_id where r.id=$1 and p.school_id=$2",[id,school])
      : await c.query(`select updated_at::text from ${table} where id=$1 and school_id=$2`,[id,school]);
    if (!existing.rowCount) fail("该设置不属于当前学校。", "This setting does not belong to this school.");
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
    if ((await c.query(`select 1 from ${table} where school_id=$1 and id<>coalesce($2::uuid,gen_random_uuid()) and starts_on<=$4::date and ends_on>=$3::date`,[school,id||null,a,b])).rowCount) fail("日期与该学校已有设置重叠，请编辑已有记录。", "Dates overlap an existing entry. Edit that entry instead.");
    const t = kind === "exception" && field(f,"exceptionType") === "time" ? time(f) : null;
    if (id) await c.query(`update ${table} set name=$2,starts_on=$3,ends_on=$4,updated_at=clock_timestamp()${kind === "exception" ? ",pickup_time=$5" : ""} where id=$1`,kind === "exception" ? [id,n,a,b,t] : [id,n,a,b]);
    else await c.query(`insert into ${table}(school_id,name,starts_on,ends_on${kind === "exception" ? ",pickup_time" : ""}) values($1,$2,$3,$4${kind === "exception" ? ",$5" : ""})`,kind === "exception" ? [school,n,a,b,t] : [school,n,a,b]);
    return;
  }
  const weekdays = days(f);
  if (kind === "rule") {
    const pickupTime = time(f);
    const classes = [...new Set(f.getAll("classroomIds").map(String))];
    if (!classes.length || (await c.query("select id from classrooms where school_id=$1 and id=any($2::uuid[])",[school,classes])).rowCount !== classes.length) fail("请选择当前学校的班级。", "Select classes belonging to this school.");
    if ((await c.query(`select 1 from school_pickup_rules p join school_pickup_rule_classes pc on pc.rule_id=p.id where p.school_id=$1 and p.id<>coalesce($2::uuid,gen_random_uuid()) and p.weekdays && $3::integer[] and pc.classroom_id=any($4::uuid[])`,[school,id||null,weekdays,classes])).rowCount) fail("所选班级在这些星期已有接送时间，请修改已有规则。", "These classes already have pickup times on these weekdays.");
    if (id && (await c.query("select 1 from pickup_routes where rule_id=$1 and not weekdays <@ $2::integer[]",[id,weekdays])).rowCount) fail("已有线路使用了被移除的星期，请先调整线路。", "Update routes before removing weekdays they use.");
    const result = id
      ? await c.query("update school_pickup_rules set name=$2,weekdays=$3,pickup_time=$4,updated_at=clock_timestamp() where id=$1 returning id",[id,n,weekdays,pickupTime])
      : await c.query("insert into school_pickup_rules(school_id,name,weekdays,pickup_time) values($1,$2,$3,$4) returning id",[school,n,weekdays,pickupTime]);
    const rule = result.rows[0].id;
    await c.query("delete from school_pickup_rule_classes where rule_id=$1",[rule]);
    await c.query("insert into school_pickup_rule_classes(rule_id,classroom_id) select $1,unnest($2::uuid[])",[rule,classes]);
  } else {
    const rule = field(f,"ruleId"), program = field(f,"programId");
    if (!(await c.query("select id from school_pickup_rules where id=$1 and school_id=$2 and $3::integer[] <@ weekdays",[rule,school,weekdays])).rowCount) fail("请选择本校规则，线路星期必须在规则范围内。", "Select this school's rule and a subset of its weekdays.");
    if (!(await c.query("select id from after_school_programs where id=$1",[program])).rowCount) fail("请选择有效目的地。", "Select a valid destination.");
    if (id) await c.query("update pickup_routes set name=$2,rule_id=$3,program_id=$4,weekdays=$5,updated_at=clock_timestamp() where id=$1",[id,n,rule,program,weekdays]);
    else await c.query("insert into pickup_routes(name,rule_id,program_id,weekdays) values($1,$2,$3,$4)",[n,rule,program,weekdays]);
  }
}

export const pickupPreviewSql = `
 select d::date::text as date,r.name as route,p.name as rule,a.name as destination,
        to_char(coalesce(e.pickup_time,p.pickup_time),'HH24:MI') as time,
        (select string_agg(c.name,', ' order by c.name) from school_pickup_rule_classes pc join classrooms c on c.id=pc.classroom_id where pc.rule_id=p.id) as classes
 from school_terms t
 cross join lateral generate_series(t.starts_on::timestamp,t.ends_on::timestamp,interval '1 day') d
 join school_pickup_rules p on p.school_id=t.school_id
 join pickup_routes r on r.rule_id=p.id and extract(isodow from d)::integer=any(r.weekdays)
 join after_school_programs a on a.id=r.program_id
 left join school_calendar_exceptions e on e.school_id=t.school_id and d::date between e.starts_on and e.ends_on
 where t.id=$1 and t.school_id=$2 and (e.id is null or e.pickup_time is not null)
 order by d,coalesce(e.pickup_time,p.pickup_time),r.name`;
