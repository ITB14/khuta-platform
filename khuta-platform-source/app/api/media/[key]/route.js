import fs from 'node:fs';
import path from 'node:path';
const S = require('../../../../lib/session');
const M = require('../../../../lib/media');

const ROOT = path.join(process.cwd(), 'media');

export async function GET(req, { params }) {
  const { key } = await params;
  const url = new URL(req.url);
  const user = await S.currentUser();
  if (!user) return new Response('unauthorised', { status: 401 });
  if (!M.verifyMediaUrl(key, user.id, url.searchParams.get('e'), url.searchParams.get('s'))) {
    return new Response('link expired or not yours', { status: 403 });
  }

  const file = path.join(ROOT, path.basename(key));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) return new Response('not found', { status: 404 });

  const size = fs.statSync(file).size;
  const range = req.headers.get('range');
  const TYPES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4a': 'audio/mp4' };
  const common = {
    'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=0, no-store',
  };

  // Range support is what lets the browser start playing before the whole
  // file arrives, and what makes the progress bar scrub at all.
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? Number(m[1]) : 0;
    const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    }
    return new Response(fs.createReadStream(file, { start, end }), {
      status: 206,
      headers: { ...common, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) },
    });
  }
  return new Response(fs.createReadStream(file), {
    status: 200, headers: { ...common, 'content-length': String(size) },
  });
}
