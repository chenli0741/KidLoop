"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";

export function FormPanel({ heading, children, className = "" }: {
  heading: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const locale = useLocale();

  return (
    <aside className={`form-panel disclosure-panel ${className}`}>
      {heading}
      <button className="form-disclosure" type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={17} /> : <Plus size={17} />}
        {expanded ? text(locale, "收起", "Close") : text(locale, "展开", "Open")}
      </button>
      <div id={id} className={expanded ? "panel-content expanded" : "panel-content"}>
        {children}
      </div>
    </aside>
  );
}
