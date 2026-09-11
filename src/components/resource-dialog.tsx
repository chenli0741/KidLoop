"use client";

import { useRef } from "react";
import { Plus, X } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";

export function ResourceDialog({ title, trigger, children }: { title: string; trigger?: React.ReactNode; children: React.ReactNode }) {
  const locale = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    {trigger ?? <button type="button" className="button secondary resource-add-trigger" onClick={() => dialog.current?.showModal()}><Plus size={17} />{text(locale, "添加", "Add")}</button>}
    <dialog ref={dialog} className="record-dialog resource-editor-dialog" aria-label={title}>
      <div className="record-dialog-heading"><h2>{title}</h2><button type="button" className="icon-button" onClick={() => dialog.current?.close()} aria-label={text(locale, "关闭", "Close")}><X size={18} /></button></div>
      {children}
    </dialog>
  </>;
}
