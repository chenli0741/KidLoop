import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export const AVATAR_THUMBNAIL_SIZE = 216;

// Call only after checking the current user's access to this student's avatar.
export async function avatarThumbnailResponse(
  request: Request,
  version: string,
  load: () => Promise<ReadableStream<Uint8Array> | null>,
) {
  const etag = `"${createHash('sha256').update(`avatar-webp-v1:${version}`).digest('hex')}"`;
  const headers = {
    'Content-Type': 'image/webp',
    'Cache-Control': 'private, no-cache',
    'Vary': 'Cookie',
    'X-Content-Type-Options': 'nosniff',
    'ETag': etag,
  };
  const matches = request.headers.get('if-none-match')?.split(',').some(value => value.trim().replace(/^W\//, '') === etag);
  if (matches) return new Response(null, { status: 304, headers });
  const stream = await load();
  if (!stream) return new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const input = Buffer.from(await new Response(stream).arrayBuffer());
  const thumbnail = await sharp(input)
    .resize(AVATAR_THUMBNAIL_SIZE, AVATAR_THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 }).toBuffer();
  return new Response(new Uint8Array(thumbnail), { headers });
}
