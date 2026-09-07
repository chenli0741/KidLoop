import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { savePickupSetting, pickupPreviewSql } from "../src/lib/pickup-settings";

test("school rules share calendars across routes without drivers and validate edits",async()=>{
  const url=process.env.KIDLOOP_TEST_DATABASE_URL;
  assert.ok(url && ["localhost","127.0.0.1"].includes(new URL(url).hostname));
  const pool=new pg.Pool({connectionString:url}), c=await pool.connect();
  const schema=`pickup_test_${randomUUID().replaceAll("-","")}`;
  const form=(v:Record<string,string|string[]>)=>{const f=new FormData();for(const [k,a] of Object.entries(v))for(const x of Array.isArray(a)?a:[a])f.append(k,x);return f;};
  const save=async(v:Record<string,string|string[]>)=>{
    await c.query("begin");try{await savePickupSetting(c,form(v));await c.query("commit");}catch(e){await c.query("rollback");throw e;}
  };
  const id=async(sql:string,v:unknown[]=[]) => (await c.query(sql+" returning id",v)).rows[0].id as string;
  const version=async(table:string,id:string)=>(await c.query(`select updated_at::text from ${table} where id=$1`,[id])).rows[0].updated_at;
  try{
    await c.query(`create schema ${schema}`);await c.query(`set search_path to ${schema}`);
    for(const f of (await readdir("db/migrations")).filter(f=>f.endsWith(".sql")).sort())await c.query(await readFile(`db/migrations/${f}`,"utf8"));
    const school=await id("insert into schools(name,address) values('Ellis','Address')"), other=await id("insert into schools(name,address) values('Other','Address')");
    const program=await id("insert into after_school_programs(name,address) values('Program A','Address')"), programB=await id("insert into after_school_programs(name,address) values('Program B','Address')");
    const term={schoolId:school,kind:"term",name:"Fall",startsOn:"2026-09-07",endsOn:"2026-09-13"};
    await save(term);await assert.rejects(save(term),/overlap/);
    await assert.rejects(save({...term,startsOn:"2026-02-30"}),/valid dates/);
    const termId=(await c.query("select id from school_terms")).rows[0].id;
    const rule={schoolId:school,kind:"rule",name:"Regular",grades:["1","2","3"],weekdays:["1","2","4","5"],pickupTime:"14:30"};
    await assert.rejects(save({...rule,grades:[]}),/valid grade/);
    await save(rule);await assert.rejects(save({...rule,grades:["3","4"]}),/already have/);
    await save({...rule,name:"Wednesday",weekdays:["3"],pickupTime:"13:00"});
    const rules=(await c.query("select id,name from school_pickup_rules")).rows;
    const regular=rules.find(r=>r.name==="Regular")!.id, wed=rules.find(r=>r.name==="Wednesday")!.id;
    const route={schoolId:school,kind:"route",name:"Ellis A",ruleId:regular,programId:program,weekdays:["1","2","4","5"]};
    await save(route);await save({...route,name:"Ellis B",programId:programB});
    await save({...route,name:"Wednesday A",ruleId:wed,weekdays:["3"]});
    await assert.rejects(save({...route,name:"Bad",weekdays:["3"]}),/subset/);
    await assert.rejects(save({...route,schoolId:other}),/school/);
    await assert.rejects(save({...rule,id:regular,updatedAt:await version("school_pickup_rules",regular),weekdays:["1"]}),/Update routes/);
    await save({schoolId:school,kind:"exception",name:"Holiday",startsOn:"2026-09-07",endsOn:"2026-09-07",exceptionType:"closed"});
    await save({schoolId:school,kind:"exception",name:"Early pickup",startsOn:"2026-09-08",endsOn:"2026-09-08",exceptionType:"time",pickupTime:"12:00"});
    const preview=async()=>(await c.query(pickupPreviewSql,[termId,school])).rows;
    let rows=await preview();assert.deepEqual(rows[0].grades,["1","2","3"]);assert.equal(rows.length,7);assert.equal(rows.filter(r=>r.date==="2026-09-07").length,0);
    assert.deepEqual(rows.filter(r=>r.date==="2026-09-08").map(r=>r.time),["12:00","12:00"]);
    assert.equal(rows.find(r=>r.date==="2026-09-09")!.time,"13:00");
    const oldVersion=await version("school_pickup_rules",regular);
    await save({...rule,id:regular,updatedAt:oldVersion,pickupTime:"14:45"});
    rows=await preview();assert.deepEqual(rows.filter(r=>r.date==="2026-09-10").map(r=>r.time),["14:45","14:45"]);
    await assert.rejects(save({...rule,id:regular,updatedAt:oldVersion}),/Refresh/);
    await assert.rejects(save({schoolId:school,kind:"rule",id:regular,updatedAt:await version("school_pickup_rules",regular),remove:"1"}),/Remove routes/);
    const routeId=(await c.query("select id from pickup_routes where name='Ellis A'")).rows[0].id;
    await save({...route,id:routeId,updatedAt:await version("pickup_routes",routeId),name:"Updated route",weekdays:["2"]});
    assert.equal((await preview()).filter(r=>r.route==="Updated route").length,1);
    await save({schoolId:school,kind:"route",id:routeId,updatedAt:await version("pickup_routes",routeId),remove:"1"});
    assert.equal((await preview()).filter(r=>r.route==="Updated route").length,0);
    assert.equal((await c.query("select count(*)::int as n from drivers")).rows[0].n,0);
    assert.equal((await c.query("select count(*)::int as n from trips")).rows[0].n,0);
  }finally{await c.query(`drop schema if exists ${schema} cascade`);c.release();await pool.end();}
});
