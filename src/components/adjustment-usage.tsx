import { text, type Locale } from "@/lib/i18n";
import type { DraftView } from "@/lib/rescheduling/types";

const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function AdjustmentUsage({ usage, locale }: { usage: DraftView["usage"]; locale: Locale }) {
  if (!usage.length) return null;
  const t = (zh: string, en: string) => text(locale, zh, en);
  const missing = t("未返回", "Not returned");
  return (
    <section className="adjust-usage" aria-label={t("每次调用用量", "Usage per call")}>
      <h3>{t("每次调用用量", "Usage per call")}</h3>
      {usage.map((u, i) => {
        const input = count(u.usage?.input_tokens);
        const output = count(u.usage?.output_tokens);
        const total = count(u.usage?.total_tokens) ??
          (input !== null && output !== null ? input + output : null);
        const elapsed = count(u.elapsed_ms);
        const cost = u.estimated_usd === null ? null : count(Number(u.estimated_usd));
        const costText = cost === null ? t("待核算", "Pending") :
          cost > 0 && cost < 0.000001 ? "< $0.000001" : `$${cost.toFixed(6)}`;
        return (
          <article className="adjust-usage-call" key={u.id ?? i}>
            <p><strong>{t(`第 ${i + 1} 次`, `Call ${i + 1}`)}</strong> · {u.kind === "AUDIO" ? t("语音转文字", "Transcription") : t("文字解析", "Text parsing")} · {u.status === "COMPLETED" ? t("成功", "Completed") : u.status === "FAILED" ? t("失败", "Failed") : u.status}</p>
            <dl className="adjust-usage-metrics">
              <div><dt>{t("耗时", "Duration")}</dt><dd>{elapsed === null ? missing : `${(elapsed / 1000).toFixed(1)} ${t("秒", "s")}`}</dd></div>
              <div><dt>{t("Token 用量", "Tokens")}</dt><dd>{total === null ? missing : total.toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}</dd></div>
              <div><dt>{t("费用（USD）", "Cost (USD)")}</dt><dd>{costText}</dd></div>
            </dl>
            <p className="adjust-usage-detail">{u.created_at && <><time dateTime={u.created_at}>{new Date(u.created_at).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { timeZone: "America/Los_Angeles" })}</time> · </>}{u.model} · {t("输入", "Input")} {input ?? missing} / {t("输出", "Output")} {output ?? missing}</p>
          </article>
        );
      })}
      <p>{t("耗时为模型调用耗时；费用按返回用量与配置单价估算。", "Duration covers the model call; cost is estimated from returned usage and configured rates.")}</p>
    </section>
  );
}
