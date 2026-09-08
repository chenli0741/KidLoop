"use client";

import { useId, useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Archive, Plus, Pencil, Trash2, X } from "lucide-react";

export function SchoolFilter({ schools, selected, label, page = "/students", tab }: {
  schools: { id: string; name: string }[]; selected: string; label: string;
  page?: "/students" | "/schedule"; tab?: "school" | "preview";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <label className="roster-school" aria-busy={pending}>
    <span>{label}</span>
    <select aria-label={label} value={selected} disabled={pending || !schools.length} onChange={(event) => {
      const schoolId = event.target.value;
      const params = new URLSearchParams({ school: schoolId });
      if (tab) params.set("tab", tab);
      startTransition(() => router.push(`${page}?${params}`, { scroll: false }));
    }}>
      {!schools.length && <option value="">—</option>}
      {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
    </select>
  </label>;
}

export function RosterCreateDialog({ title, closeLabel, children, icon = "add", iconOnly = false }: {
  title: string; closeLabel: string; children: ReactNode; iconOnly?: boolean; icon?: "add" | "edit" | "remove" | "archive";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const Icon = icon === "edit" ? Pencil : icon === "remove" ? Trash2 : icon === "archive" ? Archive : Plus;
  return <>
    <button type="button" className={iconOnly ? `icon-button${icon === "remove" ? " danger" : ""}` : "button secondary compact"} aria-label={title} title={iconOnly ? title : undefined} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}><Icon size={16} />{!iconOnly && title}</button>
    <dialog ref={dialog} className="record-dialog" aria-labelledby={titleId}>
      <div className="record-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label={closeLabel} onClick={() => dialog.current?.close()}><X size={20} /></button></div>
      {children}
    </dialog>
  </>;
}
