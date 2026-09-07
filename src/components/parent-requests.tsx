import { MessageSquareText } from "lucide-react";
import { getParentRequests } from "@/lib/parent-data";
import { text, type Locale } from "@/lib/i18n";

export async function ParentRequests({ date, locale }: { date: string; locale: Locale }) {
  const requests = await getParentRequests(date);
  if (!requests.length) return null;
  return <section className="content-section parent-requests"><div className="section-heading"><h2>{text(locale, "家长请假与留言", "Parent absences & notes")}</h2><MessageSquareText size={20} /></div>
    <div className="record-grid">{requests.map((r) => <article className="request-card" key={r.studentId}>
      <div><strong>{r.studentName}</strong>{r.absent && <span className="status-badge status-absent">{text(locale, "家长请假", "Parent absence")}</span>}</div>
      {r.note && <p>{r.note}</p>}<small>{r.parentName} · {r.serviceDate}</small>
    </article>)}</div>
  </section>;
}
