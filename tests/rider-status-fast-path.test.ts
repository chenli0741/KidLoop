import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PoolClient,QueryResult} from 'pg';
import {changeRiderStatus} from '../src/lib/rider-status';
import type {AuthUser} from '../src/lib/types';

test('ordinary pickup skips shared and operating-term advisory locks',async()=>{
 const assignment='11111111-1111-4111-8111-111111111111';
 const student='22222222-2222-4222-8222-222222222222';
 const trip='33333333-3333-4333-8333-333333333333';
 const stop='44444444-4444-4444-8444-444444444444';
 const queries:string[]=[];
 const client={query:async(sql:string)=>{
  queries.push(sql);
  const normalized=sql.replaceAll(/\s+/g,' ').trim();
  let rows:unknown[]=[];
  if(normalized.startsWith('select ts.student_id'))rows=[{student_id:student,trip_id:trip,shared:false}];
  else if(normalized.startsWith('select id from students'))rows=[{id:student}];
  else if(normalized.startsWith('select trip_id, status'))rows=[{trip_id:trip,status:'SCHEDULED',parent_absence:false,pickup_stop_id:stop,dropoff_stop_id:'55555555-5555-4555-8555-555555555555'}];
  else if(normalized.startsWith('select status,scheduled_date'))rows=[{status:'PUBLISHED',scheduled_date:'2026-09-25',current_stop_index:0,progress_state:'AT_STOP',route_stops:[{id:stop,schoolId:'66666666-6666-4666-8666-666666666666',programId:null}]}];
  return {rows,rowCount:rows.length} as QueryResult;
 }} as unknown as PoolClient;
 const user={id:'77777777-7777-4777-8777-777777777777',role:'DRIVER',driverId:'88888888-8888-4888-8888-888888888888'} as AuthUser;
 assert.equal(await changeRiderStatus(client,user,assignment,'PICKED_UP'),trip);
 assert.equal(queries.some(sql=>sql.includes('pg_advisory_xact_lock')),false);
 assert.equal(queries.some(sql=>sql.includes('from operating_terms')),false);
});
