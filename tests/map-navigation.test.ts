import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapNavigationUrl} from '../src/lib/map-navigation';

test('map navigation URLs encode the destination and request driving directions',()=>{
  assert.equal(mapNavigationUrl('apple','1 Main St, San Jose'), 'https://maps.apple.com/?daddr=1%20Main%20St%2C%20San%20Jose&dirflg=d');
  assert.equal(mapNavigationUrl('google','1 Main St, San Jose'), 'https://www.google.com/maps/dir/?api=1&destination=1%20Main%20St%2C%20San%20Jose&travelmode=driving');
  assert.throws(()=>mapNavigationUrl('google','   '),/unavailable/);
});
