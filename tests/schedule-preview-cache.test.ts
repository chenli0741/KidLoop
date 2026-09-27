import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {QueryResult} from 'pg';
import {readTrialRange,type TrialSummary} from '../src/lib/schedule-trial-data';

test('unchanged scheduling revision returns cached summaries without loading trial input',async()=>{
 const summary:TrialSummary={date:'2026-09-28',hasTrips:true,issueCount:0,holiday:false,checked:true,driverIds:['driver']};
 const queries:string[]=[];
 const reader={query:async(sql:string)=>{
  queries.push(sql);
  if(sql.includes('schedule_input_revisions'))return {rows:[{revision:'17'}]} as QueryResult;
  if(sql.includes('schedule_preview_cache'))return {rows:[{service_date:'2026-09-28',revision:'hash',source_revision:'17',payload:summary}]} as QueryResult;
  throw new Error('The full scheduling input should not be read when the version is unchanged.');
 }};
 const result=await readTrialRange(reader,['2026-09-28']);
 assert.deepEqual(result,{summaries:[summary],days:[]});
 assert.equal(queries.length,2);
});
