import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativePhotoFile,pickerCanceled} from '../src/lib/photo-client';
test('native photo content becomes a file without fetching the native temporary path',async()=>{
 const bytes=Uint8Array.from([255,216,255,224,0,16,74,70,73,70]);
 const file=nativePhotoFile({base64String:Buffer.from(bytes).toString('base64')});
 assert.equal(file.type,'image/jpeg');assert.deepEqual(new Uint8Array(await file.arrayBuffer()),bytes);
});
test('invalid and oversized bridge content fails explicitly; cancellation stays silent',()=>{
 assert.throws(()=>nativePhotoFile({}),/format/);
 assert.throws(()=>nativePhotoFile({base64String:'!invalid!'}),/format/);
 assert.throws(()=>nativePhotoFile({base64String:'a'.repeat(20*1024*1024+1)}),/size/);
 assert.equal(pickerCanceled(new Error('User cancelled photos app')),true);
});
