import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDriverPreferences} from '../src/lib/driver-preferences';
test('preference validation rejects missing schools, invalid IDs, modes and reversed time ranges',()=>{
 const f=new FormData();f.set('schoolPreferenceMode','ONLY');assert.throws(()=>parseDriverPreferences(f));
 f.set('preferredSchoolIds','bad');assert.throws(()=>parseDriverPreferences(f));
 f.set('preferredSchoolIds','12345678-1234-1234-1234-123456789abc');f.set('earliestDismissalTime','13:00');f.set('latestDismissalTime','12:00');assert.throws(()=>parseDriverPreferences(f));
 f.set('latestDismissalTime','14:00');assert.equal(parseDriverPreferences(f).preferredSchoolIds?.length,1);
 f.set('schoolPreferenceMode','NONE');assert.deepEqual(parseDriverPreferences(f).preferredSchoolIds,[]);
 f.set('schoolPreferenceMode','BAD');assert.throws(()=>parseDriverPreferences(f));
});
