import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { db } from "../src/lib/db";
import { todayInOperationsTimeZone } from "../src/lib/date";

async function main() {
  const { values } = parseArgs({ options: { date: { type: "string" } } });
  const date = values.date ?? todayInOperationsTimeZone();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
    throw new Error("Invalid date");
  const c = await db.connect();
  try {
    await c.query("begin isolation level repeatable read read only");
    const { rows } = await c.query(`select id,request_id,created_at,kind,model,status,elapsed_ms,
      usage->'input_tokens' as input_tokens,usage->'output_tokens' as output_tokens,
      coalesce(usage->'total_tokens',to_jsonb((usage->>'input_tokens')::bigint+(usage->>'output_tokens')::bigint)) as total_tokens,
      estimated_usd,price_basis,usage as raw_usage
      from reschedule_usage
      where created_at >= ($1::date::timestamp at time zone 'America/Los_Angeles')
        and created_at < (($1::date+1)::timestamp at time zone 'America/Los_Angeles')
      order by created_at,id`, [date]);
    const folder = resolve(".local-data/ai-usage-logs");
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const output = resolve(folder, `${date}.jsonl`);
    await writeFile(output, rows.map(row => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), { mode: 0o600 });
    console.log(`${rows.length} 条调用日志已导出：${output}`);
  } finally {
    await c.query("rollback").finally(() => c.release());
  }
}
main().catch(() => {
  console.error("日志导出失败，请检查日期和数据库配置。");
  process.exitCode = 1;
}).finally(() => db.end());
