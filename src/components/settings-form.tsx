"use client";
import { useActionState, type ReactNode } from "react";
import { Save } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";
import type { FormState } from "@/lib/types";

export function SettingsForm({ action, children, submitLabel }: { action: (state: FormState, form: FormData) => Promise<FormState>; children: ReactNode; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  const locale = useLocale();
  return <form action={formAction} className="settings-form"><fieldset disabled={pending} className="form-grid settings-fields">{children}
    {state.message && <p role="status" className={`full form-message ${state.ok ? "success" : "error"}`}>{state.message}</p>}
    <button className="button primary full" type="submit"><Save size={17} />{pending ? text(locale, "保存中…", "Saving…") : submitLabel}</button>
  </fieldset></form>;
}
