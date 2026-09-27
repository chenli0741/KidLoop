import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {QueryResult} from 'pg';
import {serialSqlReader} from '../src/lib/sql-reader';

test('serialSqlReader never overlaps queries on one transaction client',async()=>{
 let active=0,maxActive=0;
 const reader=serialSqlReader({query:async()=>{
  active++;maxActive=Math.max(maxActive,active);
  await new Promise(resolve=>setTimeout(resolve,5));
  active--;
  return {rows:[],rowCount:0,command:'SELECT',oid:0,fields:[]} as QueryResult;
 }});
 await Promise.all([reader.query('select 1'),reader.query('select 2'),reader.query('select 3')]);
 assert.equal(maxActive,1);
});
