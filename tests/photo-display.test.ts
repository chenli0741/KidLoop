import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayedStudentPhoto, usesDemoPhotos, DEMO_STUDENT_PHOTO } from '../src/lib/photo-display';
test('only the exact demo login uses cartoons and restricted language policy', () => {
  for (const email of ['test@test.kidloop.local', ' Test@TEST.KIDLOOP.LOCAL ']) {
    assert.equal(usesDemoPhotos({email}), true);
    assert.equal(displayedStudentPhoto({email}, '/api/photos/private-id'), DEMO_STUDENT_PHOTO);
  }
  for (const email of ['admin@test.kidloop.local','driver@test.kidloop.local','parent@test.kidloop.local','someone@example.com','test@test.kidloop.local.example.com']) {
    assert.equal(usesDemoPhotos({email}), false);
    for (const url of ['/api/photos/private-id','https://example.test/photo.jpg','']) assert.equal(displayedStudentPhoto({email},url),url);
  }
});
