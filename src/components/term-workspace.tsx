import Link from "next/link";
import type { OperatingTerm } from "@/lib/operating-terms";
import { text, type Locale } from "@/lib/i18n";
export function TermWorkspace({
  term,
  locale,
}: {
  term?: OperatingTerm;
  locale: Locale;
}) {
  return (
    <section className="term-workspace">
      <div>
        <strong>
          {term?.name ??
            text(locale, "开始新的运营学期", "Start a new operating term")}
        </strong>
        <p>
          {term
            ? `${term.startsOn} — ${term.endsOn}`
            : text(
                locale,
                "上一学期归档保留；创建新学期后再安排学校、学生和线路。",
                "Archived terms are retained. Create a term to plan schools, students and routes.",
              )}
        </p>
      </div>
      <Link className="button secondary compact" href="/terms">
        {term
          ? text(locale, "学期管理", "Manage term")
          : text(locale, "新建学期", "Create term")}
      </Link>
    </section>
  );
}
