import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayedStudentPhoto, recognitionStudentPhoto, usesDemoPhotos, DEMO_STUDENT_PHOTO } from '../src/lib/photo-display';

test('every account displays the individual cartoon, never a reference photo', () => {
  for (const email of ['test@test.kidloop.local','admin@test.kidloop.local','driver@test.kidloop.local','parent@test.kidloop.local','someone@example.com']) {
    const user = {email};
    assert.equal(displayedStudentPhoto(user,'/api/photos/private-id','/api/student-avatars/student-id'),'/api/student-avatars/student-id');
    assert.equal(displayedStudentPhoto(user,'/api/photos/new-photo'),DEMO_STUDENT_PHOTO);
    assert.equal(displayedStudentPhoto(user,''), '');
    assert.equal(displayedStudentPhoto(user,'','/api/student-avatars/original'), '/api/student-avatars/original');
  }
});

test('matching retains the original except for the exact demo login', () => {
  for (const email of ['test@test.kidloop.local',' Test@TEST.KIDLOOP.LOCAL ']) {
    assert.equal(usesDemoPhotos({email}),true);
    assert.equal(recognitionStudentPhoto({email},'/api/photos/private-id'),DEMO_STUDENT_PHOTO);
    assert.equal(recognitionStudentPhoto({email},''),'');
  }
  for (const email of ['admin@test.kidloop.local','driver@test.kidloop.local','test@test.kidloop.local.example.com']) {
    assert.equal(usesDemoPhotos({email}),false);
    assert.equal(recognitionStudentPhoto({email},'/api/photos/private-id'),'/api/photos/private-id');
  }
});
