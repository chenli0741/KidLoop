import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_STUDENT_PHOTO, displayedStudentPhoto, usesDemoPhotos } from '../src/lib/photo-display';

test('all Test login identities use replacement photos regardless of display name or role', () => {
  for (const email of ['test', 'admin', 'driver', 'parent', 'lina'].map(name => `${name}@test.kidloop.local`)) {
    assert.equal(displayedStudentPhoto({ email }, '/api/photos/private-id'), DEMO_STUDENT_PHOTO);
    assert.equal(displayedStudentPhoto({ email }, 'https://example.test/legacy-real-photo.jpg'), DEMO_STUDENT_PHOTO);
    assert.equal(displayedStudentPhoto({ email }, ''), DEMO_STUDENT_PHOTO);
  }
  assert.equal(usesDemoPhotos({ email: ' Test@TEST.KIDLOOP.LOCAL ' }), true);
});

test('non-Test logins keep real photos and missing-photo state', () => {
  for (const email of ['test@example.com', 'user@test.kidloop.local.example.com', 'parent@example.com']) {
    assert.equal(usesDemoPhotos({ email }), false);
    assert.equal(displayedStudentPhoto({ email }, '/api/photos/private-id'), '/api/photos/private-id');
    assert.equal(displayedStudentPhoto({ email }, ''), '');
  }
});
