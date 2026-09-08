"use client";

import { TriangleAlert } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useLocale();
  return (
    <div className="error-page">
      <div>
        <TriangleAlert size={30} />
        <h1>{text(locale, "出现错误", "Something went wrong")}</h1>
        <p>{text(locale, "Kid Loop 无法加载工作区，请检查数据库连接后重试。", "Kid Loop could not load this workspace. Check the database connection and try again.")}</p>
        <button className="button primary" type="button" onClick={reset}>{text(locale, "重试", "Try again")}</button>
      </div>
    </div>
  );
}
