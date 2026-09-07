"use client";

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { Pencil, Save, Trash2, X } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";
import type { FormState } from "@/lib/types";

type Props = {
  id: string;
  name: string;
  updatedAt: string;
  editTitle: string;
  deleteDescription: string;
  update: (form: FormData) => Promise<FormState>;
  remove: (form: FormData) => Promise<FormState>;
  children: ReactNode;
};

export function RecordActions(props: Props) {
  const locale = useLocale();
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [message, setMessage] = useState("");
  return (
    <div className="record-actions">
      <div className="record-action-buttons">
        <button type="button" className="icon-button" title={text(locale, `编辑 ${props.name}`, `Edit ${props.name}`)} aria-label={text(locale, `编辑 ${props.name}`, `Edit ${props.name}`)} onClick={() => { setMessage(""); setMode("edit"); }}><Pencil size={16} /></button>
        <button type="button" className="icon-button danger" title={text(locale, `删除 ${props.name}`, `Delete ${props.name}`)} aria-label={text(locale, `删除 ${props.name}`, `Delete ${props.name}`)} onClick={() => { setMessage(""); setMode("delete"); }}><Trash2 size={16} /></button>
      </div>
      {message ? <p className="record-feedback" role="status">{message}</p> : null}
      {mode ? <RecordDialog {...props} mode={mode} close={() => setMode(null)} done={(result) => { setMessage(result); setMode(null); }} /> : null}
    </div>
  );
}

function RecordDialog({ mode, close, done, ...props }: Props & { mode: "edit" | "delete"; close: () => void; done: (message: string) => void }) {
  const locale = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [version] = useState(props.updatedAt);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);

  return (
    <dialog ref={dialog} className="record-dialog" aria-labelledby={titleId} onCancel={(event) => { if (pending) event.preventDefault(); }} onClose={close}>
      <div className="record-dialog-heading"><h2 id={titleId}>{mode === "edit" ? props.editTitle : text(locale, `删除 ${props.name}`, `Delete ${props.name}`)}</h2><button type="button" className="icon-button" aria-label={text(locale, "关闭", "Close")} title={text(locale, "关闭", "Close")} disabled={pending} onClick={close}><X size={18} /></button></div>
      <form onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError("");
        startTransition(async () => {
          try {
            const result = await (mode === "edit" ? props.update(form) : props.remove(form));
            if (result.ok) done(result.message);
            else setError(result.message);
          } catch { setError(text(locale, "操作失败，请刷新后重试。", "Could not save. Refresh and try again.")); }
        });
      }}>
        <input type="hidden" name="id" value={props.id} />
        <input type="hidden" name="updatedAt" value={version} />
        <fieldset disabled={pending} className="record-dialog-fields form-grid">
          {mode === "edit" ? props.children : <p className="full record-delete-description">{props.deleteDescription}</p>}
        </fieldset>
        {error ? <p className="form-message error" role="alert">{error}</p> : null}
        <div className="record-dialog-footer">
          <button type="button" className="button secondary" disabled={pending} onClick={close}>{text(locale, "取消", "Cancel")}</button>
          <button type="submit" className={`button ${mode === "delete" ? "record-delete-button" : "primary"}`} disabled={pending}>
            {mode === "delete" ? <Trash2 size={17} /> : <Save size={17} />}
            {pending ? text(locale, "保存中...", "Saving...") : mode === "delete" ? text(locale, "确认删除", "Confirm deletion") : text(locale, "保存修改", "Save changes")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
