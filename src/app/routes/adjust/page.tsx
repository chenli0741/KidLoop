import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { db } from "@/lib/db";
import { AdjustmentWorkspace } from "@/components/adjustment-workspace";
export const dynamic = "force-dynamic";
export default async function AdjustmentPage() {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  const rows = (
    await db.query(`select
    (select coalesce(jsonb_object_agg(id,name),'{}') from schools) as schools,
    (select coalesce(jsonb_object_agg(id,name),'{}') from drivers) as drivers,
    (select coalesce(jsonb_object_agg(id,name),'{}') from vehicles) as vehicles,
    (select coalesce(jsonb_object_agg(id,name),'{}') from fixed_routes where operating_term_id=current_operating_term()) as routes,
    (select coalesce(jsonb_object_agg(s.id,s.name),'{}') from students s join term_students ts on ts.student_id=s.id where ts.operating_term_id=current_operating_term()) as students`)
  ).rows[0];
  return (
    <div className="page-container">
      <Link className="adjust-back" href="/routes">
        ← {text(locale, "返回线路", "Back to routes")}
      </Link>
      <header className="adjust-heading">
        <span>Kid Loop Rides</span>
        <h1>{text(locale, "智能调整接送安排", "Adjust pickup schedules")}</h1>
        <p>
          {text(
            locale,
            "说出变化，查看联动方案，确认后生效。",
            "Describe the change, review a coordinated plan, then confirm.",
          )}
        </p>
      </header>
      <AdjustmentWorkspace
        catalog={rows}
        configured={
          !!process.env.OPENAI_API_KEY &&
          !!process.env.OPENAI_RESCHEDULING_MODEL
        }
      />
    </div>
  );
}
