import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { calculatePlan, validateIntent } from "../src/lib/rescheduling/planner";
import { reschedulingExample } from "../src/lib/rescheduling/example";
import { todayInOperationsTimeZone } from "../src/lib/date";
import type { Intent, PlannedRoute, Snapshot } from "../src/lib/rescheduling/types";

async function main() {
  const { values } = parseArgs({ options: {
    input: { type: "string" }, snapshot: { type: "string" },
    example: { type: "boolean" }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("npm run reschedule:simulate -- --example\nnpm run reschedule:simulate -- --input intent.json [--snapshot snapshot.json]\nWithout --snapshot, DATABASE_URL is read in a read-only transaction. No API or schedule writes.");
    return;
  }
  if (values.example && (values.input || values.snapshot)) throw new Error("--example 不能同时指定输入文件");
  if (!values.example && !values.input) throw new Error("请提供 --input 或使用 --example");
  const example = values.example ? reschedulingExample() : null;
  const input: { instruction: string; intent: Intent } = example
    ? { instruction: "【虚构示例】9 月 8 日将 s2 学校 K 年级放学时间改为 12:15，优先沿用现有司机。", intent: example.intent }
    : JSON.parse(await readFile(resolve(values.input!), "utf8"));
  if (typeof input.instruction !== "string" || !input.instruction.trim() || !input.intent) throw new Error("输入须包含 instruction 和 intent");
  const { startsOn, endsOn } = input.intent;
  for (const date of [startsOn, endsOn])
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
      throw new Error("日期无效");
  if (endsOn < startsOn || Date.parse(endsOn) - Date.parse(startsOn) > 13 * 86400000) throw new Error("一次最多模拟 14 天");
  let snapshot: Snapshot;
  if (example) snapshot = example.snapshot;
  else if (values.snapshot) snapshot = JSON.parse(await readFile(resolve(values.snapshot), "utf8"));
  else {
    // Dynamic imports keep offline simulation independent of any database configuration.
    const { db } = await import("../src/lib/db");
    try {
      const { readSnapshot } = await import("../src/lib/rescheduling/snapshot");
      const c = await db.connect();
      try {
        await c.query("begin isolation level repeatable read read only");
        await c.query("set local statement_timeout = '20s'");
        snapshot = await readSnapshot(c, startsOn, endsOn);
      } finally {
        await c.query("rollback").finally(() => c.release());
      }
    } finally { await db.end(); }
  }
  if (!snapshot?.term || ![snapshot.routes, snapshot.students, snapshot.drivers, snapshot.vehicles, snapshot.days].every(Array.isArray)) throw new Error("快照格式无效");
  const expected: string[] = [];
  for (let n = Date.parse(startsOn); n <= Date.parse(endsOn); n += 86400000) expected.push(new Date(n).toISOString().slice(0, 10));
  if (JSON.stringify(snapshot.days.map(d => d.date)) !== JSON.stringify(expected)) throw new Error("快照日期必须与指令范围完全一致");
  validateIntent(input.intent, snapshot, example ? startsOn : todayInOperationsTimeZone());
  const result = calculatePlan(snapshot, input.intent);
  const mode = example ? "虚构示例" : values.snapshot ? "离线快照" : "真实数据只读快照";
  const lines = ["# 接送排班模拟结果", "", `数据来源：${mode}。未调用模型 API，未保存正式排班。`, "", `原指令：${input.instruction}`, "", "指令由当前对话整理为结构化条件；本次验证排班规则，不验证模型理解准确率。", "", `日期：${startsOn} 至 ${endsOn}`, `候选：${result.candidates.length}；搜索节点：${result.examined}`, ""];
  const describe = (route: PlannedRoute) => {
    const driver = snapshot.drivers.find(d => d.id === route.driverId)?.name ?? route.driverId;
    const vehicle = snapshot.vehicles.find(v => v.id === route.vehicleId)?.name ?? route.vehicleId;
    return `${route.name} · ${driver} / ${vehicle} · ${route.stops.map(s => `${s.time} ${s.name}`).join(" → ")} · 学生：${route.students.map(s => snapshot.students.find(r => r.id === s.studentId)?.name ?? s.studentId).join("、")}`;
  };
  result.candidates.forEach((candidate, i) => {
    lines.push(`## 方案 ${i + 1}`, "", `变更线路次数：${candidate.changedRoutes}；受影响学生次数：${candidate.changedStudents}；新增司机：${candidate.additionalDrivers}`, "");
    for (const day of candidate.days) {
      lines.push(`### ${day.date}`, "", "调整前：", "", ...day.before.map(r => `- ${describe(r)}`), "", "调整后：", "", ...day.after.map(r => `- ${describe(r)}`), "");
    }
  });
  if (result.conflicts.length) lines.push("## 冲突", "", ...result.conflicts.map(s => `- ${s}`), "");
  if (result.warnings.length) lines.push("## 提示", "", ...result.warnings.map(s => `- ${s}`), "");
  const folder = resolve(".local-data/rescheduling-simulations", `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  for (const [name, data] of Object.entries({ "input.json": input, "snapshot.json": snapshot, "result.json": result }))
    await writeFile(resolve(folder, name), JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  await writeFile(resolve(folder, "report.md"), lines.join("\n"), { mode: 0o600 });
  console.log(`${mode}：${result.candidates.length} 个方案，${result.conflicts.length} 项冲突。\n${folder}/report.md`);
}
main().catch(() => {
  // Database errors can contain connection details or private records. Keep CLI failures generic.
  console.error("模拟未完成。请核对输入日期、快照结构和 DATABASE_URL 配置；未写入正式排班。");
  process.exitCode = 1;
});
