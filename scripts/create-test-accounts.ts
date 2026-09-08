import pg from "pg";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { hashPassword } from "../src/lib/password";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
  const pool = new pg.Pool({ connectionString: url.toString() });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const driver = (await client.query<{ id: string; name: string }>("select id,name from drivers where id='37dd4080-b702-4565-ae1c-bd71c51b6376' and active")).rows[0];
    if (!driver) throw new Error("Import the clearly labelled test drivers first.");
    const children = (await client.query<{ id: string; name: string }>(`
      select distinct st.id,st.name from students st join trip_students ts on ts.student_id=st.id
      join trips t on t.id=ts.trip_id join driver_shifts sh on sh.id=t.shift_id
      where sh.driver_id=$1 and st.active and st.notes like '%historical-test-data%'
      order by st.name limit 2
    `, [driver.id])).rows;
    if (!children.length) throw new Error("No historical-test-data children assigned to the test driver.");
    const accounts = [
      { role: "ADMIN", name: "Test Admin", email: "admin@test.kidloop.local", password: randomBytes(15).toString("base64url") },
      { role: "DRIVER", name: "Test Driver", email: "driver@test.kidloop.local", password: randomBytes(15).toString("base64url") },
      { role: "PARENT", name: "Test Parent", email: "parent@test.kidloop.local", password: randomBytes(15).toString("base64url") },
    ];
    for (const account of accounts) {
      const user = (await client.query<{ id: string }>("insert into app_users(name,email,role,password_hash,driver_id) values($1,$2,$3,$4,$5) returning id", [account.name, account.email, account.role, await hashPassword(account.password), account.role === "DRIVER" ? driver.id : null])).rows[0];
      if (account.role === "PARENT") for (const child of children) await client.query("insert into user_students(user_id,student_id) values($1,$2)", [user.id, child.id]);
    }
    await mkdir(".local-data", { recursive: true });
    const body = `# KidLoop 测试账号\n\n登录入口：http://localhost:3010/login\n\n| 角色 | 邮箱 | 密码 |\n| --- | --- | --- |\n${accounts.map((a) => `| ${a.name} | ${a.email} | ${a.password} |`).join("\n")}\n\n司机绑定：${driver.name}\n\n家长绑定孩子：${children.map((c) => c.name).join("、")}\n\n账号已写入当前配置数据库。代码尚未部署，先在本地使用。\n`;
    // Refuse to replace a previous credentials file or existing account.
    await writeFile(".local-data/test-accounts.md", body, { mode: 0o600, flag: "wx" });
    await client.query("commit");
    console.log(JSON.stringify({ created: accounts.map(({ role, email }) => ({ role, email })), credentials: ".local-data/test-accounts.md", linkedChildren: children.map((c) => c.name) }));
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
