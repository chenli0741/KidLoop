"use client";

import { TriangleAlert } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useLocale();
  return (
    <div className="error-page">
      <div>
        <TriangleAlert size={30} />
        <h1>{text(locale, "出现错误", "Something went wrong")}</h1>
        <p>{text(locale, "暂时无法加载，请重试。若仍失败，请将错误编号提供给管理员。", "Unable to load right now. Try again. If it still fails, share the error reference with your administrator.")}</p>
        {error.digest && <p>{text(locale,'错误编号','Error reference')}: {error.digest}</p>}
        <button className="button primary" type="button" onClick={reset}>{text(locale, "重试", "Try again")}</button>
      </div>
    </div>
  );
}
