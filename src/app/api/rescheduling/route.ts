import { getUser } from "@/lib/auth";
import { db, transaction } from "@/lib/db";
import { todayInOperationsTimeZone } from "@/lib/date";
import { openTerm } from "@/lib/operating-terms";
import { getDraft, trial, applyDraft, applyRules, regenerateRulesSchedule } from "@/lib/rescheduling/service";
import { parseRequest, transcribe } from "@/lib/rescheduling/ai";
export const runtime = "nodejs";
export const maxDuration = 60;
const uuid = (s: unknown): s is string =>
  typeof s === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function bodyBytes(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("请求为空 / Empty request");
  let total = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error("请求过大 / Request too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function GET(request: Request) {
  const user = await getUser();
  if (user?.role !== "ADMIN")
    return json({ error: "无权访问 / Forbidden" }, 403);
  const id = new URL(request.url).searchParams.get("id");
  if (!uuid(id)) return json({ error: "记录无效 / Invalid ID" }, 400);
  try {
    return json(await getDraft(db, id, user.id));
  } catch {
    return json({ error: "记录不存在 / Not found" }, 404);
  }
}
export async function POST(request: Request) {
  const user = await getUser();
  if (user?.role !== "ADMIN")
    return json({ error: "无权访问 / Forbidden" }, 403);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return json({ error: "请求来源无效 / Invalid origin" }, 403);
  let attempted: { id: string; revision: number } | undefined;
  try {
    const audio = request.headers
      .get("content-type")
      ?.startsWith("multipart/form-data");
    const bytes = await bodyBytes(request, audio ? 4_000_000 : 12000);
    if (audio) {
      const form = await new Request(request.url, {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type")! },
        body: bytes,
      }).formData();
      const id = form.get("id"),
        file = form.get("audio");
      if (
        !uuid(id) ||
        !(file instanceof File) ||
        !/^(audio\/(webm|mp4|mpeg|wav|x-wav|m4a)|video\/webm)/.test(file.type)
      )
        throw new Error("请选择有效音频 / Select a valid audio file");
      const draft = await getDraft(db, id, user.id);
      if (draft.status === "APPLIED")
        throw new Error("请新建调整 / Start a new adjustment");
      if (
        (
          await db.query(
            "select 1 from reschedule_usage where request_id=$1 and created_at>now()-interval '1 minute' having count(*)>=6",
            [id],
          )
        ).rowCount
      )
        throw new Error("操作过于频繁 / Too many requests");
      return json({ text: await transcribe(db, id, file) });
    }
    const input = JSON.parse(bytes.toString());
    if (input.action === "create") {
      const term = await openTerm(db);
      if (!term) throw new Error("请先设置运营学期 / Set up an operating term");
      if (
        (
          await db.query(
            "select 1 from reschedule_requests where user_id=$1 and created_at>now()-interval '1 hour' having count(*)>=30",
            [user.id],
          )
        ).rowCount
      )
        throw new Error("操作过于频繁 / Too many requests");
      const row = (
        await db.query(
          "insert into reschedule_requests(user_id,operating_term_id) values($1,$2) returning id",
          [user.id, term.id],
        )
      ).rows[0];
      return json(await getDraft(db, row.id, user.id));
    }
    if (!uuid(input.id) || !Number.isInteger(input.revision))
      throw new Error("请求版本无效 / Invalid request version");
    if (input.action === "apply") {
      if (
        input.confirmed !== true ||
        !Number.isInteger(input.candidate) ||
        input.candidate < 0 ||
        input.candidate > 2
      )
        throw new Error("请确认所选方案 / Confirm the selected plan");
      await transaction((c) =>
        applyDraft(
          c,
          input.id,
          user.id,
          input.revision,
          input.candidate,
          todayInOperationsTimeZone(),
        ),
      );
    } else if (input.action === "apply-rules") {
      if (input.confirmed !== true) throw new Error("请确认规则调整 / Confirm the rule changes");
      await transaction((c) => applyRules(c, input.id, user.id, input.revision, todayInOperationsTimeZone()));
    } else if (input.action === "regenerate") {
      await transaction((c) => regenerateRulesSchedule(c, input.id, user.id, input.revision, todayInOperationsTimeZone()));
    } else if (input.action === "trial") {
      if (
        typeof input.message !== "string" ||
        !input.message.trim() ||
        input.message.length > 4000
      )
        throw new Error("请输入 1–4000 字的调整要求 / Enter 1–4000 characters");
      const previous = await getDraft(db, input.id, user.id);
      if (
        previous.messages.join("").length + input.message.length > 8000 ||
        previous.revision >= 10
      )
        throw new Error(
          "本次对话已达上限，请新建调整 / Start a new adjustment to continue",
        );
      const messages = [...previous.messages, input.message.trim()];
      const claimed = await db.query(
        `update reschedule_requests set revision=revision+1,messages=$4,intent=null,result=null,error=null,status='DRAFT',updated_at=clock_timestamp()
        where id=$1 and user_id=$2 and revision=$3 and status<>'APPLIED' returning revision`,
        [input.id, user.id, input.revision, JSON.stringify(messages)],
      );
      if (!claimed.rowCount)
        throw new Error(
          "草案已有新版本，请刷新 / A newer draft exists; refresh",
        );
      const revision = claimed.rows[0].revision;
      attempted = { id: input.id, revision };
      const intent = await parseRequest(
        db,
        input.id,
        messages,
        todayInOperationsTimeZone(),
        input.locale === "en" ? "en" : "zh",
      );
      if (intent.question)
        await db.query(
          "update reschedule_requests set intent=$3 where id=$1 and revision=$2",
          [input.id, revision, JSON.stringify(intent)],
        );
      else
        await transaction(async (c) => {
          await c.query("set transaction isolation level repeatable read");
          await trial(
            c,
            input.id,
            user.id,
            revision,
            intent,
            todayInOperationsTimeZone(),
          );
        });
    } else throw new Error("操作无效 / Invalid action");
    return json(await getDraft(db, input.id, user.id));
  } catch (error) {
    // Do not expose database/provider errors, URLs, keys or raw response bodies.
    const message =
      error instanceof Error && error.message.includes(" / ")
        ? error.message
        : "操作未完成，请刷新状态后重试 / Operation did not complete; refresh status and retry";
    if (attempted)
      await db
        .query(
          "update reschedule_requests set status='FAILED',error=$4 where id=$1 and user_id=$2 and revision=$3 and status<>'APPLIED'",
          [attempted.id, user.id, attempted.revision, message],
        )
        .catch(() => {});
    return json({ error: message }, 400);
  }
}
