import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";

export function EmptyState({ title, body, href, action }: { title: string; body: string; href?: string; action?: string }) {
  return (
    <div className="empty-state">
      <ClipboardList size={28} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{body}</p>
      {href && action ? (
        <Link href={href} className="text-link">{action}<ArrowRight size={15} /></Link>
      ) : null}
    </div>
  );
}
