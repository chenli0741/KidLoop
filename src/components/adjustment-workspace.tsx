"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Send, RefreshCw, Check, Plus } from "lucide-react";
import { useLocale } from "./locale-provider";
import { text } from "@/lib/i18n";
import { AdjustmentUsage } from "./adjustment-usage";
import type { DraftView, PlannedRoute } from "@/lib/rescheduling/types";
type Catalog = Record<
  "schools" | "drivers" | "vehicles" | "students" | "routes",
  Record<string, string>
>;
export function AdjustmentWorkspace({
  catalog,
  configured,
  mode = "schedule",
}: {
  catalog: Catalog;
  configured: boolean;
  mode?: "rules" | "schedule";
}) {
  const locale = useLocale(),
    t = (zh: string, en: string) => text(locale, zh, en);
  const [draft, setDraft] = useState<DraftView | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<number | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [rulesConfirmed, setRulesConfirmed] = useState(false),
    [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentId = useRef<string | null>(null),
    mounted = useRef(true);
  function keep(value: DraftView) {
    if (draft?.id !== value.id || draft?.revision !== value.revision) {
      setSelected(null);
      setConfirmed(false);
      setRulesConfirmed(false);
    }
    setDraft(value);
    currentId.current = value.id;
    try {
      sessionStorage.setItem("kidloop-adjustment", value.id);
    } catch {}
  }
  async function call(body: unknown) {
    const response = await fetch("/api/rescheduling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error);
    return value as DraftView;
  }
  async function refresh(id = currentId.current) {
    if (!id) return;
    const response = await fetch(
      `/api/rescheduling?id=${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    const value = await response.json();
    if (!response.ok) throw new Error(value.error);
    keep(value);
  }
  useEffect(() => {
    let active = true;
    mounted.current = true;
    try {
      const id = sessionStorage.getItem("kidloop-adjustment");
      if (id)
        fetch(`/api/rescheduling?id=${encodeURIComponent(id)}`, {
          cache: "no-store",
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (active && d && !currentId.current) {
              setDraft(d);
              currentId.current = d.id;
            }
          })
          .catch(() => {});
    } catch {}
    return () => {
      active = false;
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current) recorder.current.onstop = null;
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  async function ensureDraft() {
    if (draft && draft.status !== "APPLIED") return draft;
    const value = await call({ action: "create" });
    keep(value);
    return value;
  }
  async function submit() {
    if (busy || recording || !message.trim()) return;
    setBusy(true);
    setError("");
    setSelected(null);
    setConfirmed(false);
    try {
      const d = await ensureDraft();
      keep(
        await call({
          action: "trial",
          id: d.id,
          revision: d.revision,
          message,
          locale,
        }),
      );
      setMessage("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t(
              "网络连接中断，请刷新状态。",
              "Connection interrupted; refresh status.",
            ),
      );
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!draft || selected === null || !confirmed || busy) return;
    setBusy(true);
    setError("");
    try {
      keep(
        await call({
          action: "apply",
          id: draft.id,
          revision: draft.revision,
          candidate: selected,
          confirmed: true,
        }),
      );
      setConfirmed(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("请刷新以确认保存结果。", "Refresh to check the save result."),
      );
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function applyRulesOnly() {
    if (!draft || !rulesConfirmed || busy) return;
    setBusy(true); setError("");
    try {
      keep(await call({ action: "apply-rules", id: draft.id, revision: draft.revision, confirmed: true }));
      setRulesConfirmed(false);
    } catch (e) { setError(e instanceof Error ? e.message : t("规则保存失败，请刷新重试。", "Could not save rules; refresh and try again.")); await refresh().catch(() => {}); }
    finally { setBusy(false); }
  }
  async function regenerate() {
    if (!draft || busy) return;
    setBusy(true); setError("");
    try { keep(await call({ action: "regenerate", id: draft.id, revision: draft.revision })); }
    catch (e) { setError(e instanceof Error ? e.message : t("重新排班失败，请刷新重试。", "Could not regenerate the schedule; refresh and try again.")); await refresh().catch(() => {}); }
    finally { setBusy(false); }
  }
  async function startRecording() {
    setError("");
    setBusy(true);
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          t(
            "当前设备不支持录音，请使用文字输入。",
            "Recording is unavailable; please type.",
          ),
        );
      const d = await ensureDraft();
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const mimeType = ["audio/mp4", "audio/webm"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = rec;
      const chunks: Blob[] = [];
      let size = 0;
      rec.ondataavailable = (e) => {
        chunks.push(e.data);
        size += e.data.size;
        if (size > 3_500_000 && rec.state === "recording") rec.stop();
      };
      rec.onstop = async () => {
        if (timer.current) clearTimeout(timer.current);
        media.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setBusy(true);
        try {
          if (size > 3_800_000)
            throw new Error(
              t(
                "录音过长，请缩短后重试。",
                "Recording is too long; try a shorter message.",
              ),
            );
          const form = new FormData();
          form.set("id", d.id);
          const type = rec.mimeType.split(";")[0];
          form.set(
            "audio",
            new Blob(chunks, { type }),
            type.includes("mp4") ? "request.m4a" : "request.webm",
          );
          const r = await fetch("/api/rescheduling", {
              method: "POST",
              body: form,
            }),
            data = await r.json();
          if (!r.ok) throw new Error(data.error);
          setMessage((previous) =>
            previous ? `${previous}\n${data.text}` : data.text,
          );
          await refresh(d.id);
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : t(
                  "转写失败，可输入文字。",
                  "Transcription failed; please type.",
                ),
          );
        } finally {
          setBusy(false);
        }
      };
      rec.start(1000);
      setRecording(true);
      timer.current = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 60000);
    } catch (e) {
      stream.current?.getTracks().forEach((track) => track.stop());
      setError(
        e instanceof Error
          ? e.message
          : t("无法录音，请检查麦克风权限。", "Check microphone access."),
      );
    } finally {
      setBusy(false);
    }
  }
  const localized = (value: string) =>
    value.split(" / ")[locale === "en" ? 1 : 0] ?? value;
  const card = (p: PlannedRoute, index: number) => (
    <article className="adjust-route" key={`${p.sourceIds.join("-")}-${index}`}>
      <strong>
        {p.stops[0]?.time} – {p.stops.at(-1)?.time}
      </strong>
      <p>
        {catalog.drivers[p.driverId] ?? "—"} ·{" "}
        {catalog.vehicles[p.vehicleId] ?? "—"}
      </p>
      <ol>
        {p.stops.map((s, i) => (
          <li key={`${s.id}-${i}`}>
            <time>{s.time}</time> {s.name}
          </li>
        ))}
      </ol>
      <details>
        <summary>
          {p.students.length} {t("名学生", "riders")}
        </summary>
        <ul>
          {p.students.map((s) => (
            <li key={s.studentId}>{catalog.students[s.studentId] ?? "—"}</li>
          ))}
        </ul>
      </details>
    </article>
  );
  const isRuleAdjustment = !!draft?.intent &&
    (draft.intent.changes.length > 0 || !!draft.intent.closures?.length);
  return (
    <div className="adjust-workspace">
      <section className="adjust-input">
        <div className="section-heading">
          <h2>{t("描述变化", "Describe the change")}</h2>
          <button
            type="button"
            disabled={busy || recording}
            onClick={() => {
              setDraft(null);
              currentId.current = null;
              setSelected(null);
              setConfirmed(false);
              setMessage("");
              setError("");
              try {
                sessionStorage.removeItem("kidloop-adjustment");
              } catch {}
            }}
          >
            <Plus size={16} />
            {t("新调整", "New")}
          </button>
        </div>
        {!configured && (
          <p className="adjust-notice">
            {t(
              "智能调整尚未配置，请联系管理员。",
              "Smart adjustments are not configured. Contact your administrator.",
            )}
          </p>
        )}
        {draft?.messages.map((m, i) => (
          <p className="adjust-message" key={i}>
            {m}
          </p>
        ))}
        {draft?.intent?.question && (
          <div className="adjust-question" role="status">
            <strong>{t("需要补充，尚未生成方案", "More detail needed; no plan generated")}</strong>
            <p>{draft.intent.question}</p>
          </div>
        )}
        <label htmlFor="adjust-message">
          {t("调整要求或补充条件", "Change or additional constraint")}
        </label>
        <textarea
          id="adjust-message"
          rows={5}
          maxLength={4000}
          value={message}
          disabled={busy || recording}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t(
            mode === "rules" ? "例如：10月5日至9日 Cumberland 和 Cherry Chase 全校 11:35 放学。" : "例如：这周 Ellis 的 K 年级十二点放学，其他年级照常，尽量不要增加司机。",
            mode === "rules" ? "For example: Cumberland and Cherry Chase dismiss at 11:35 for all grades from October 5 to 9." : "For example: Ellis grade K dismisses at noon this week. Keep other grades unchanged and use existing drivers if possible.",
          )}
        />
        <div className="adjust-actions">
          <button
            type="button"
            disabled={busy || !configured}
            onClick={() =>
              recording ? recorder.current?.stop() : void startRecording()
            }
          >
            {recording ? <Square size={17} /> : <Mic size={17} />}{" "}
            {recording
              ? t("停止录音", "Stop recording")
              : t("语音输入", "Voice input")}
          </button>
          <button
            className="button primary"
            type="button"
            disabled={busy || recording || !message.trim() || !configured}
            onClick={() => void submit()}
          >
            <Send size={17} />
            {busy ? t("处理中…", "Working…") : draft?.intent?.question ? t("提交补充", "Submit detail") : t("生成方案", "Generate plans")}
          </button>
        </div>
        {recording && (
          <p role="status">
            {t(
              "正在录音，最长 60 秒。停止后可修改识别文字。",
              "Recording, up to 60 seconds. You can edit the transcript.",
            )}
          </p>
        )}
        {draft && (
          <button
            type="button"
            disabled={busy || recording}
            onClick={() => {
              setError("");
              void refresh().catch((e) => setError(e.message));
            }}
          >
            <RefreshCw size={15} />
            {t("刷新调整状态", "Refresh status")}
          </button>
        )}
        {(error || draft?.error) && (
          <p className="adjust-error" role="alert">
            {localized(error || draft?.error || "")}
          </p>
        )}
        {draft?.intent && !draft.intent.question && (
          <div className="adjust-understanding">
            <h3>{t("本次范围", "Scope")}</h3>
            <p>
              {draft.intent.startsOn} — {draft.intent.endsOn}
            </p>
            {!!draft.intent.closures?.length && <div className="adjust-rule-confirm">
              <h3>{t("停课安排", "School closures")}</h3>
              {draft.intent.closures.map((closure, index) => <p key={index}>{catalog.schools[closure.schoolId]} · {closure.startsOn}{closure.endsOn !== closure.startsOn ? ` — ${closure.endsOn}` : ""} · {t("放假，不接送", "Closed, no pickup")}</p>)}
            </div>}
            {(draft.intent.changes.length > 0 || !!draft.intent.closures?.length) && <div className="adjust-rule-confirm">
              <h3>{t("规则调整", "Rule changes")}</h3>
              <p>{t("确认后，系统会保存学校日历规则并立即更新行程。", "After confirmation, the system saves the school calendar rule and updates the schedule immediately.")}</p>
              {draft.intent.closures?.map((closure, index) => <p key={`closure-${index}`}>{catalog.schools[closure.schoolId]} · {closure.startsOn}{closure.endsOn !== closure.startsOn ? ` — ${closure.endsOn}` : ""} · {t("放假，不接送", "Closed, no pickup")}</p>)}
              {draft.intent.changes.map((change, index) => <p key={index}>{catalog.schools[change.schoolId]} · {change.grades.join(", ")} · {change.time}</p>)}
              {draft.status === "READY" && <><label><input type="checkbox" checked={rulesConfirmed} disabled={busy} onChange={event => setRulesConfirmed(event.target.checked)} />{t("我已核对这项规则调整。", "I reviewed this rule change.")}</label><button className="button primary" type="button" disabled={!rulesConfirmed || busy} onClick={() => void applyRulesOnly()}>{busy ? t("更新中…", "Updating…") : t("确认并更新行程", "Confirm and update schedule")}</button></>}
              {draft.status === "RULES_APPLIED" && <button className="button primary" type="button" disabled={busy} onClick={() => void regenerate()}>{busy ? t("更新中…", "Updating…") : t("完成行程更新", "Finish schedule update")}</button>}
            </div>}
            {draft.intent.changes.map((c, i) => (
              <p key={i}>
                {catalog.schools[c.schoolId]} · {c.grades.join(", ")} · {c.time}
              </p>
            ))}
            {!!draft.intent.unavailableDriverIds.length && (
              <p>
                {t("不可用司机：", "Unavailable drivers: ")}
                {draft.intent.unavailableDriverIds
                  .map((id) => catalog.drivers[id])
                  .join(", ")}
              </p>
            )}
            {!!draft.intent.unavailableVehicleIds.length && (
              <p>
                {t("不可用车辆：", "Unavailable vehicles: ")}
                {draft.intent.unavailableVehicleIds
                  .map((id) => catalog.vehicles[id])
                  .join(", ")}
              </p>
            )}
            {!!draft.intent.lockedRouteIds.length && (
              <p>
                {t("保持不变：", "Keep unchanged: ")}
                {draft.intent.lockedRouteIds
                  .map((id) => catalog.routes[id])
                  .join(", ")}
              </p>
            )}
            <p>
              {draft.intent.noAdditionalDrivers
                ? t("不增加司机", "Do not add drivers")
                : draft.intent.preferExistingDrivers
                  ? t("优先使用现有司机", "Prefer existing drivers")
                  : t("按现有可用人车试算", "Use available resources")}
            </p>
            <p>
              {t(
                "仅按现有规则调整；确认前不会修改正式安排。",
                "Existing rules apply. Schedules change only after confirmation.",
              )}
            </p>
          </div>
        )}
      </section>
      <section className="adjust-results" aria-live="polite" aria-busy={busy}>
        {draft?.status === "APPLIED" ? (
          <div className="adjust-success">
            <Check />
            <h2>{t("已应用", "Applied")}</h2>
            <p>
              {draft.intent?.startsOn} — {draft.intent?.endsOn}
            </p>
            <p>
              {isRuleAdjustment
                ? t(
                    "学校日历规则和未开始行程已经更新；已开始的行程及其他学校保持不变。",
                    "The school calendar rule and unstarted rides are updated. Started rides and other schools remain unchanged.",
                  )
                : t(
                    "司机和家长可在现有日程页面查看新安排。",
                    "Drivers and parents can view the new schedule in their usual pages.",
                  )}
            </p>
            <small>{draft.id}</small>
          </div>
        ) : isRuleAdjustment ? (
          <div className="adjust-notice" role="status">
            <h2>{t("规则调整", "Rule update")}</h2>
            <p>
              {draft?.status === "RULES_APPLIED"
                ? t("规则已经保存。请点击上方按钮完成这次行程更新。", "The rule is saved. Tap the button above to finish this schedule update.")
                : t("这类调整只有一个确定结果，不需要选择多个方案。请在上方确认一次。", "This change has one deterministic result. Confirm it once above; no plan selection is needed.")}
            </p>
          </div>
        ) : (
          <>
            <h2>{t("联动方案", "Coordinated plans")}</h2>
            {!draft?.result && (
              <p className="adjust-empty">
                {busy
                  ? t(
                      "正在理解变化并检查相关安排…",
                      "Understanding changes and checking schedules…",
                    )
                  : draft?.intent?.question
                    ? t("当前正在等待你的补充，尚未生成方案，也没有修改正式行程。", "Waiting for your detail. No plan was generated and no live ride was changed.")
                    : t("提交调整要求后，在这里查看前后对照。", "Submit your change to review schedules here.")}
              </p>
            )}
            {draft?.result?.conflicts.map((c, i) => (
              <p className="adjust-error" key={i}>
                {localized(c)}
              </p>
            ))}
            {draft?.result?.candidates.map((c, i) => (
              <div
                className={`adjust-candidate ${selected === i ? "selected" : ""}`}
                key={i}
              >
                <div className="section-heading">
                  <h3>
                    {t("方案", "Plan")} {i + 1}
                  </h3>
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={selected === i}
                    onClick={() => {
                      setSelected(i);
                      setConfirmed(false);
                    }}
                  >
                    {selected === i
                      ? t("已选择", "Selected")
                      : t("选择", "Select")}
                  </button>
                </div>
                <p>
                  {c.changedRoutes} {t("条线路调整", "route changes")} ·{" "}
                  {c.changedStudents}{" "}
                  {t("人次涉及", "rider assignments affected")} ·{" "}
                  {c.additionalDrivers} {t("名额外司机", "additional drivers")}
                </p>
                {c.days.map((d) => (
                  <details key={d.date} open={c.days.length === 1}>
                    <summary>
                      {d.date} · {d.replaceIds.length}{" "}
                      {t("条线路调整", "route changes")}
                    </summary>
                    <div className="adjust-comparison">
                      <div>
                        <h4>{t("原安排", "Before")}</h4>
                        {d.before.map(card)}
                      </div>
                      <div>
                        <h4>{t("新安排", "After")}</h4>
                        {d.after.map(card)}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            ))}
            {draft?.result?.warnings.map((w, i) => (
              <p className="adjust-notice" key={i}>
                {localized(w)}
              </p>
            ))}
            {selected !== null && draft?.status === "READY" && (
              <div className="adjust-confirm">
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  {t(
                    "我已核对所选方案的日期、学生、人车及时间变化。",
                    "I reviewed the dates, riders, resources and time changes.",
                  )}
                </label>
                <button
                  className="button primary"
                  type="button"
                  disabled={!confirmed || busy}
                  onClick={() => void apply()}
                >
                  {busy
                    ? t("处理中…", "Working…")
                    : t("确认应用所选方案", "Apply selected plan")}
                </button>
              </div>
            )}
          </>
        )}
        <AdjustmentUsage usage={draft?.usage ?? []} locale={locale} />
      </section>
    </div>
  );
}
