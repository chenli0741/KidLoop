import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validPassword,hashPassword,verifyPassword} from '../src/lib/password';

test('passwords accept 6 to 128 characters and verify securely',async()=>{
  assert.equal(validPassword('a'.repeat(5)),false);
  assert.equal(validPassword('a'.repeat(6)),true);
  assert.equal(validPassword('a'.repeat(128)),true);
  assert.equal(validPassword('a'.repeat(129)),false);
  const hash=await hashPassword('sample7');
  assert.equal(await verifyPassword('sample7',hash),true);
  assert.equal(await verifyPassword('wrong77',hash),false);
});
