import "server-only";
import type { PoolClient } from "pg";
import type { AuthUser } from "./types";

export class AccountEditError extends Error {}
export async function saveAccount(c: PoolClient, actor: AuthUser, form: FormData) {
  if (actor.role !== "ADMIN") throw new AccountEditError("forbidden");
  const value = (key: string) => String(form.get(key) ?? "").trim();
  const id = value("userId"), name = value("name"), email = value("email").toLowerCase(), phone = value("phone"), role = value("role");
  const driver = role === "DRIVER" ? value("driverId") : null;
  const children = role === "PARENT" ? [...new Set(form.getAll("studentIds").map(String))].sort() : [];
  if (!name || name.length > 100 || phone.length > 80 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["ADMIN", "DRIVER", "PARENT"].includes(role) || (role === "DRIVER" && !driver)) throw new AccountEditError("invalid");
  const current = (await c.query("select id,role,driver_id,updated_at::text as version from app_users where id=$1 for update", [id])).rows[0];
  if (!current) throw new AccountEditError("missing");
  if (current.version !== value("updatedAt")) throw new AccountEditError("stale");
  if (id === actor.id && role !== "ADMIN") throw new AccountEditError("selfRole");
  const previous = (await c.query("select student_id from user_students where user_id=$1 order by student_id", [id])).rows.map(r => r.student_id);
  if (driver && !(await c.query("select id from drivers where id=$1 and (active or id=$2)", [driver,current.driver_id])).rowCount) throw new AccountEditError("invalid");
  if (children.length && (await c.query("select id from students where id=any($1::uuid[]) and (active or id=any($2::uuid[]))", [children,previous])).rowCount !== children.length) throw new AccountEditError("invalid");
  await c.query("update app_users set name=$2,email=$3,phone=$4,role=$5,driver_id=$6,updated_at=clock_timestamp() where id=$1", [id,name,email,phone,role,driver]);
  await c.query("delete from user_students where user_id=$1", [id]);
  for (const child of children) await c.query("insert into user_students(user_id,student_id) values($1,$2)", [id,child]);
  if (current.role !== role || current.driver_id !== driver || JSON.stringify(previous) !== JSON.stringify(children)) await c.query("delete from user_sessions where user_id=$1", [id]);
}
