"use client";

import { useActionState, useEffect, useRef } from "react";
import { CheckCircle2, Plus, TriangleAlert } from "lucide-react";
import type { FormState } from "@/lib/types";

const initialState: FormState = { ok: false, message: "" };

type ActionFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
};

export function ActionForm({ action, children, submitLabel, className = "form-grid" }: ActionFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      <div className="form-footer">
        {state.message ? (
          <p className={state.ok ? "form-message success" : "form-message error"} role="status">
            {state.ok ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
            {state.message}
          </p>
        ) : <span />}
        <button className="button primary" type="submit" disabled={pending}>
          <Plus size={17} aria-hidden="true" />
          {pending ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
