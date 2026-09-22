import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeClientErrorReport} from '../src/lib/client-error-report';

test('client error reports retain a searchable reference and bounded diagnostics',()=>{
 const report=normalizeClientErrorReport({reference:'UI-1USHMQQB',message:'x'.repeat(700),stack:'y'.repeat(5000),path:'/driver'});
 assert.equal(report?.reference,'UI-1USHMQQB');
 assert.equal(report?.message.length,500);
 assert.equal(report?.stack.length,4000);
 assert.equal(report?.path,'/driver');
});

test('client error reports reject invalid references and external-looking paths',()=>{
 assert.equal(normalizeClientErrorReport({reference:'bad ref',path:'/driver'}),null);
 assert.equal(normalizeClientErrorReport({reference:'UI-1USHMQQB',path:'//outside.example'}),null);
});
