import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { avatarThumbnailResponse } from '../src/lib/avatar-thumbnail';
import { parentStudentPhoto } from '../src/lib/photo-display';

test('parent thumbnails are bounded WebP images and revalidate without loading the blob again', async () => {
  const source = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#187350' } }).png().toBuffer();
  let reads = 0;
  const load = async () => { reads++; return new Response(new Uint8Array(source)).body; };
  const request = new Request('https://example.test/avatar?size=216');
  const first = await avatarThumbnailResponse(request, 'v1', load);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'private, no-cache');
  assert.equal(first.headers.get('vary'), 'Cookie');
  const metadata = await sharp(Buffer.from(await first.arrayBuffer())).metadata();
  assert.equal(metadata.width, 216); assert.equal(metadata.height, 216); assert.equal(metadata.format, 'webp');
  const cached = new Request(request, { headers: { 'If-None-Match': `W/${first.headers.get('etag')}` } });
  const unchanged = await avatarThumbnailResponse(cached, 'v1', load);
  assert.equal(unchanged.status, 304); assert.equal(reads, 1); assert.equal(await unchanged.text(), '');
  const changed = await avatarThumbnailResponse(cached, 'v2', load);
  assert.equal(changed.status, 200); assert.equal(reads, 2);
  assert.notEqual(changed.headers.get('etag'), first.headers.get('etag'));
});

test('parent thumbnails preserve empty photos and never expose reference photos', () => {
  const user = { email: 'parent@example.test' };
  assert.equal(parentStudentPhoto(user, ''), '');
  assert.equal(parentStudentPhoto(user, '/api/photos/reference'), '/demo-avatars/student-teal-thumb.webp');
  assert.equal(parentStudentPhoto(user, '/api/photos/reference', '/api/student-avatars/id'), '/api/student-avatars/id?size=216');
});
