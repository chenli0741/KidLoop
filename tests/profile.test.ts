import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { saveOwnProfile, changeOwnPassword, saveOwnChild } from "../src/lib/profile-management";
import { hashPassword, verifyPassword } from "../src/lib/password";
import type { AuthUser } from "../src/lib/types";

test("self-service profiles enforce ownership, preserve associations and revoke old passwords", async () => {
  const url = process.env.KIDLOOP_TEST_DATABASE_URL;
  assert.ok(url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Use an explicit local test database");
  const pool = new pg.Pool({ connectionString: url }); const client = await pool.connect();
  const schema = `profile_test_${randomUUID().replaceAll("-", "")}`;
  const form = (values: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(values)) f.set(k, v); return f; };
  const tx = async (work: () => Promise<unknown>) => {
    await client.query("begin");
    try { const value = await work(); await client.query("commit"); return value; }
    catch (error) { await client.query("rollback"); throw error; }
  };
  const id = async (sql: string, values: unknown[] = []) => (await client.query(sql + " returning id", values)).rows[0].id as string;
  try {
    await client.query(`create schema ${schema}`); await client.query(`set search_path to ${schema}`);
    for (const file of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await client.query(await readFile(`db/migrations/${file}`, "utf8"));
    const school = await id("insert into schools(name,address) values('School','Address')");
    const classroom = await id("insert into classrooms(school_id,name) values($1,'Class')", [school]);
    const program = await id("insert into after_school_programs(name,address) values('Program','Address')");
    const metadata = JSON.stringify({ kind: "historical-test-data", source: "preserve", note: "Old note" });
    const child = await id("insert into students(classroom_id,program_id,name,photo_url,grade,notes) values($1,$2,'Child','data:image/png;base64,original','1',$3)", [classroom, program, metadata]);
    const other = await id("insert into students(classroom_id,program_id,name,photo_url,grade) values($1,$2,'Other','','1')", [classroom, program]);
    const oldPassword = "Old-password-1234", newPassword = "New-password-5678";
    const parent = await id("insert into app_users(name,email,role,password_hash) values('Parent','parent@test.local','PARENT',$1)", [await hashPassword(oldPassword)]);
    await client.query("insert into user_students(user_id,student_id) values($1,$2)", [parent, child]);
    const user: AuthUser = { id: parent, name: "Parent", email: "parent@test.local", role: "PARENT", driverId: null };
    const studentVersion = (await client.query("select updated_at::text from students where id=$1", [child])).rows[0].updated_at;
    const values = { id: child, updatedAt: studentVersion, name: "Edited child", grade: "2", age: "8", notes: "New note", photoUrl: "", parentName: "Parent", parentPhone: "123", relationship: "Mother", backupPhone: "", email: "contact@test.local", classroomId: randomUUID(), programId: randomUUID(), active: "false" };
    await assert.rejects(tx(() => saveOwnChild(client, user, form({ ...values, id: other }))), /forbidden/);
    await assert.rejects(tx(() => saveOwnChild(client, { ...user, role: "DRIVER" }, form(values))), /forbidden/);
    await tx(() => saveOwnChild(client, user, form(values)));
    const changed = (await client.query("select * from students where id=$1", [child])).rows[0];
    assert.equal(changed.name, "Edited child"); assert.equal(changed.active, true); assert.equal(changed.classroom_id, classroom); assert.equal(changed.program_id, program);
    assert.equal(changed.photo_url, "data:image/png;base64,original"); assert.equal(JSON.parse(changed.notes).source, "preserve"); assert.equal(JSON.parse(changed.notes).note, "New note");
    await assert.rejects(tx(() => saveOwnChild(client, user, form(values))), /stale/);
    const version = async (userId = parent) => (await client.query("select updated_at::text from app_users where id=$1", [userId])).rows[0].updated_at;
    const profile = { name: "Updated parent", email: "parent@test.local", phone: "12345", updatedAt: await version(), role: "ADMIN", userId: randomUUID() };
    await tx(() => saveOwnProfile(client, parent, form(profile)));
    assert.equal((await client.query("select role from app_users where id=$1", [parent])).rows[0].role, "PARENT");
    await assert.rejects(tx(() => saveOwnProfile(client, parent, form(profile))), /stale/);
    await assert.rejects(tx(async () => saveOwnProfile(client, parent, form({ ...profile, updatedAt: await version(), email: "new@test.local", currentPassword: "wrong" }))), /password/);
    await tx(async () => saveOwnProfile(client, parent, form({ ...profile, updatedAt: await version(), email: "new@test.local", currentPassword: oldPassword })));
    await client.query("insert into user_sessions(token_hash,user_id,expires_at) values('one',$1,now()+interval '1 day'),('two',$1,now()+interval '1 day')", [parent]);
    await assert.rejects(tx(() => changeOwnPassword(client, parent, form({ currentPassword: "wrong", newPassword, confirmPassword: newPassword }))), /password/);
    assert.equal((await client.query("select count(*)::int as n from user_sessions")).rows[0].n, 2);
    await assert.rejects(tx(() => changeOwnPassword(client, parent, form({ currentPassword: oldPassword, newPassword, confirmPassword: "different" }))), /newPassword/);
    await tx(() => changeOwnPassword(client, parent, form({ currentPassword: oldPassword, newPassword, confirmPassword: newPassword })));
    const hash = (await client.query("select password_hash from app_users where id=$1", [parent])).rows[0].password_hash;
    assert.equal(await verifyPassword(oldPassword, hash), false); assert.equal(await verifyPassword(newPassword, hash), true);
    assert.equal((await client.query("select count(*)::int as n from user_sessions")).rows[0].n, 0);
    const driver = await id("insert into drivers(name,phone) values('Driver','')");
    const driverUser = await id("insert into app_users(name,email,role,password_hash,driver_id) values('Driver','driver@test.local','DRIVER','unused',$1)", [driver]);
    await tx(async () => saveOwnProfile(client, driverUser, form({ name: "Driver updated", email: "driver@test.local", phone: "98765", updatedAt: await version(driverUser) })));
    assert.deepEqual((await client.query("select name,phone from drivers where id=$1", [driver])).rows[0], { name: "Driver updated", phone: "98765" });
    assert.deepEqual((await client.query("select name,phone from app_users where id=$1", [driverUser])).rows[0], { name: null, phone: null });
    const beforeDriverEdit = await version(driverUser);
    await client.query("update drivers set name='Driver renamed',phone='456' where id=$1", [driver]);
    assert.notEqual(await version(driverUser), beforeDriverEdit);
    await assert.rejects(tx(() => saveOwnProfile(client, driverUser, form({ name: "Stale driver", email: "driver@test.local", phone: "98765", updatedAt: beforeDriverEdit }))), /stale/);
    assert.deepEqual((await client.query("select name,phone from app_users where id=$1", [driverUser])).rows[0], { name: null, phone: null });
  } finally {
    await client.query("rollback"); await client.query("set search_path to public"); await client.query(`drop schema ${schema} cascade`); client.release(); await pool.end();
  }
});
