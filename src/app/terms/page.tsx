import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db, query } from "@/lib/db";
import { openTerm } from "@/lib/operating-terms";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { todayInOperationsTimeZone } from "@/lib/date";
import { SettingsForm } from "@/components/settings-form";
import { PageHeader } from "@/components/page-header";
import { RosterCreateDialog } from "@/components/roster-controls";
import { TermWorkspace } from "@/components/term-workspace";
import { createTerm, archiveTerm, reviewStudent } from "./actions";
export const dynamic = "force-dynamic";
export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ archive?: string }>;
}) {
  await requireUser(["ADMIN"]);
  const locale = await getLocale(),
    t = await openTerm(db),
    params = await searchParams;
  const archives = (
    await query<{ id: string; name: string; start: string; end: string }>(
      "select id,name,starts_on::text as start,ends_on::text as end from operating_terms where status='ARCHIVED' order by ends_on desc",
    )
  ).rows;
  const selected = archives.find((a) => a.id === params.archive);
  if (selected) {
    const snap = (
      await query<{ snapshot: Record<string, Record<string, unknown>[]> }>(
        "select snapshot from operating_terms where id=$1",
        [selected.id],
      )
    ).rows[0].snapshot;
    const names = new Map<string, string>();
    for (const key of [
      "schools",
      "programs",
      "students",
      "drivers",
      "vehicles",
      "fixed_routes",
    ])
      for (const row of snap[key] ?? [])
        names.set(String(row.id), String(row.name));
    for (const row of snap.trips ?? [])
      names.set(
        String(row.id),
        `${String(row.scheduled_date).slice(0, 10)} · ${row.route_name ?? names.get(String(row.school_id)) ?? ""}`,
      );
    for (const row of snap.riders ?? [])
      names.set(
        String(row.id),
        `${names.get(String(row.student_id)) ?? ""} · ${names.get(String(row.trip_id)) ?? ""}`,
      );
    const display = (field: string, value: unknown): string => {
      if (value === null || value === undefined) return "—";
      if (field.endsWith("_id")) return names.get(String(value)) ?? "—";
      if (field === "absent")
        return value
          ? text(locale, "缺席", "Absent")
          : text(locale, "正常", "Attending");
      if (
        ["starts_on", "ends_on", "scheduled_date", "service_date"].includes(
          field,
        )
      )
        return String(value).slice(0, 10);
      if (field === "weekdays")
        return (value as number[])
          .map(
            (d) =>
              (locale === "zh"
                ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
                : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])[d - 1],
          )
          .join(", ");
      return Array.isArray(value) ? value.join(", ") : String(value);
    };
    return (
      <div className="page-container">
        <PageHeader
          title={selected.name}
          eyebrow={text(locale, "历史归档 · 只读", "Archive · Read only")}
          description={`${selected.start} — ${selected.end}`}
        />
        <Link href="/terms">
          ← {text(locale, "返回学期管理", "Back to terms")}
        </Link>
        {[
          [
            "students",
            "学生",
            "Students",
            ["name", "grade", "classroom_name", "school_name", "program_name"],
          ],
          [
            "school_terms",
            "学校日期",
            "School dates",
            ["school_id", "starts_on", "ends_on"],
          ],
          [
            "school_calendar_exceptions",
            "假期与特殊日期",
            "Holidays",
            ["school_id", "name", "starts_on", "ends_on", "pickup_time"],
          ],
          [
            "school_pickup_rules",
            "年级接送规则",
            "Grade rules",
            ["school_id", "name", "grades", "weekdays", "pickup_time"],
          ],
          ["fixed_routes", "线路", "Routes", ["name", "starts_on", "ends_on"]],
          ["stops", "站点", "Stops", ["name", "address", "arrival_time"]],
          ["shifts", "执行司机与车辆", "Assigned drivers and vehicles", ["shift_date", "driver_id", "vehicle_id", "start_time", "end_time"]],
          ["route_issues", "线路提示", "Route notices", ["route_id", "service_date", "message"]],
          [
            "trips",
            "行程",
            "Trips",
            ["route_name", "scheduled_date", "status"],
          ],
          [
            "riders",
            "学生执行状态",
            "Rider statuses",
            ["student_id", "status", "picked_up_at", "dropped_off_at"],
          ],
          [
            "history",
            "操作历史",
            "Status history",
            ["trip_student_id", "from_status", "to_status", "created_at"],
          ],
          [
            "day_plans",
            "请假与留言",
            "Absence and notes",
            ["student_id", "service_date", "absent", "note"],
          ],
        ].map(([key, zh, en, fields]) => (
          <details className="pickup-section" key={String(key)}>
            <summary>
              {text(locale, String(zh), String(en))} ·{" "}
              {(snap[String(key)] ?? []).length}
            </summary>
            {(snap[String(key)] ?? []).map((row, i) => (
              <p key={i}>
                {(fields as string[])
                  .map((f) => display(f, row[f]))
                  .join(" · ")}
              </p>
            ))}
          </details>
        ))}
      </div>
    );
  }
  const students = t
    ? (
        await query<{
          id: string;
          name: string;
          grade: string;
          classroom_id: string;
          program_id: string;
          reviewed: boolean | null;
          previous_grade: string | null;
          previous_classroom_name: string | null;
        }>(
          `select s.id,s.name,s.grade,s.classroom_id,s.program_id,ts.reviewed,ts.previous_grade,prev.name as previous_classroom_name from students s left join term_students ts on ts.student_id=s.id and ts.operating_term_id=$1 left join classrooms prev on prev.id=ts.previous_classroom_id where s.active order by ts.reviewed nulls last,s.name`,
          [t.id],
        )
      ).rows
    : [];
  const classrooms = (
    await query<{ id: string; name: string }>(
      "select c.id,s.name || ' · ' || c.name as name from classrooms c join schools s on s.id=c.school_id order by s.name,c.name",
    )
  ).rows;
  const programs = (
    await query<{ id: string; name: string }>(
      "select id,name from after_school_programs order by name",
    )
  ).rows;
  return (
    <div className="page-container">
      <PageHeader
        title={text(locale, "运营学期", "Operating terms")}
        eyebrow="KidLoop"
        description={text(
          locale,
          "一次初始化，按学期计划和归档。",
          "Initialize once, plan and archive by term.",
        )}
      />
      {t ? (
        <>
          <TermWorkspace term={t} locale={locale} />
          <section className="pickup-section">
            <h2>
              {text(locale, "学生核对与加入", "Review and enroll students")}
            </h2>
            <p>
              {text(
                locale,
                "沿用名单须逐人核对年级、班级和课外班；不会自动升班。",
                "Review each student's grade, class and destination. Grades are never advanced automatically.",
              )}
            </p>
            {students.map((s) => (
              <div className="pickup-record" key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <p>
                    {s.reviewed === null
                      ? text(locale, "未加入本期", "Not enrolled")
                      : s.reviewed
                        ? text(locale, "已核对", "Reviewed")
                        : text(
                            locale,
                            `待核对 · 上期年级 ${s.previous_grade ?? s.grade} · ${s.previous_classroom_name ?? "—"}`,
                            `Review needed · Prior grade ${s.previous_grade ?? s.grade} · ${s.previous_classroom_name ?? "—"}`,
                          )}
                  </p>
                </div>
                <RosterCreateDialog
                  key={`${t.id}:${s.id}:${s.reviewed}`}
                  title={text(locale, "核对资料", "Review details")}
                  icon="edit"
                  closeLabel={text(locale, "关闭", "Close")}
                >
                  <SettingsForm
                    action={reviewStudent}
                    submitLabel={text(
                      locale,
                      "确认并加入本学期",
                      "Confirm and enroll",
                    )}
                  >
                    <input type="hidden" name="operatingTermId" value={t.id} />
                    <input type="hidden" name="studentId" value={s.id} />
                    <label>
                      <span>{text(locale, "本期年级", "Current grade")}</span>
                      <input
                        name="grade"
                        defaultValue={s.grade}
                        required
                        maxLength={30}
                      />
                    </label>
                    <label>
                      <span>{text(locale, "本期班级", "Current class")}</span>
                      <select name="classroomId" defaultValue={s.classroom_id}>
                        {classrooms.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="full">
                      <span>{text(locale, "课外班", "Destination")}</span>
                      <select name="programId" defaultValue={s.program_id}>
                        {programs.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </SettingsForm>
                </RosterCreateDialog>
              </div>
            ))}
          </section>
          <section className="pickup-section">
            <h2>{text(locale, "结束学期", "End term")}</h2>
            {t.endsOn < todayInOperationsTimeZone() ? (
              <RosterCreateDialog
                title={text(locale, "归档本学期", "Archive this term")}
                icon="archive"
                closeLabel={text(locale, "关闭", "Close")}
              >
                <SettingsForm
                  action={archiveTerm}
                  submitLabel={text(locale, "确认整体归档", "Confirm archive")}
                >
                  <input type="hidden" name="id" value={t.id} />
                  <p className="full">
                    {text(
                      locale,
                      `将 ${t.name} 的学校规则、学生名单、线路和执行记录归档，日常页面清空。基础资料保留，归档只读，不能在此撤销。`,
                      `Archive ${t.name}'s rules, roster, routes and execution records. Clear the workspace, retain base records. The archive is read-only with no undo here.`,
                    )}
                  </p>
                </SettingsForm>
              </RosterCreateDialog>
            ) : (
              <p>
                {text(
                  locale,
                  `学期于 ${t.endsOn} 结束，结束后可整体归档。`,
                  `The term ends ${t.endsOn}; archive afterward.`,
                )}
              </p>
            )}
          </section>
        </>
      ) : (
        <section className="pickup-section">
          <h2>{text(locale, "新建学期", "Create term")}</h2>
          <SettingsForm
            action={createTerm}
            submitLabel={text(locale, "初始化新学期", "Initialize term")}
          >
            <label className="full">
              <span>{text(locale, "学期名称", "Term name")}</span>
              <input
                name="name"
                required
                maxLength={100}
                placeholder={text(
                  locale,
                  "例如：2027 春季学期",
                  "e.g. Spring 2027",
                )}
              />
            </label>
            <label>
              <span>{text(locale, "开始日期", "Start date")}</span>
              <input name="startsOn" type="date" required />
            </label>
            <label>
              <span>{text(locale, "结束日期", "End date")}</span>
              <input name="endsOn" type="date" required />
            </label>
            <label className="full">
              <span>
                {text(locale, "沿用安排草稿", "Reuse planning drafts")}
              </span>
              <select name="source">
                <option value="">
                  {text(locale, "从空白开始", "Start empty")}
                </option>
                {archives.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="full form-hint">
              {text(
                locale,
                "各校自动获得本期日期和美国联邦假日（可修改）。沿用规则、线路和学生名单时，旧日期与执行记录不复制；学生须核对，司机车辆须重新绑定。",
                "Initialize school dates and editable US federal holidays. Reused rules, routes and rosters exclude old dates and execution records; review students and reassign drivers/vehicles.",
              )}
            </p>
          </SettingsForm>
        </section>
      )}
      <details className="pickup-section">
        <summary>
          {text(locale, "历史归档", "Archives")} · {archives.length}
        </summary>
        {archives.map((a) => (
          <p key={a.id}>
            <Link href={`/terms?archive=${a.id}`}>
              {a.name} · {a.start} — {a.end}
            </Link>
          </p>
        ))}
      </details>
    </div>
  );
}
