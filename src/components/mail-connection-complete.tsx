"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completeGmail } from "@/app/organizations/mail-actions";
import { useLocale } from "./locale-provider";
import { text } from "@/lib/i18n";
export function MailConnectionComplete({ state, failed }: { state: string; failed: boolean }) {
  const router = useRouter(), l = useLocale(), started = useRef(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function complete() {
      try {
        const key = `mail-connect:${state}`, proof = sessionStorage.getItem(key);
        if (failed || !proof) { sessionStorage.removeItem(key); setError(true); return; }
        const result = await completeGmail(state, proof);
        sessionStorage.removeItem(key);
        if (!result.ok) { setError(true); return; }
        router.replace("/organizations"); router.refresh();
      } catch { setError(true); }
    }
    void complete();
  }, [state, failed, router]);
  return <section className="account-card"><h1>{error ? text(l, "连接未完成", "Connection incomplete") : text(l, "正在完成 Gmail 连接…", "Finishing Gmail connection…")}</h1>
    {error && <p role="alert">{text(l, "请求已过期、授权未完成或登录状态已变化。请回到公司设置重新连接，原有邮箱保持不变。", "The request expired, permission was not granted, or your login changed. Return to company settings and reconnect. Your existing mailbox stays unchanged.")}</p>}
    <Link href="/organizations">{text(l, "返回公司设置", "Return to company settings")}</Link>
  </section>;
}
