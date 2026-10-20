'use strict';
// Media is never served from a public path. Each request is handed a URL that
// is signed for one viewer and expires, so a copied link is useless to anyone
// else and useless to the same person tomorrow.
const crypto = require('node:crypto');

const TTL_SEC = 60 * 60 * 4;   // long enough for one sitting, short enough to matter

function secret() {
  const s = process.env.KHUTA_SECRET;
  if (!s) throw new Error('KHUTA_SECRET is not set');
  return s;
}
const mac = (key, exp, userId) =>
  crypto.createHmac('sha256', secret()).update(`${key}|${exp}|${userId}`).digest('base64url');

function signMediaUrl(storageKey, userId, ttl = TTL_SEC) {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  return `/api/media/${encodeURIComponent(storageKey)}?e=${exp}&s=${mac(storageKey, exp, userId)}`;
}

function verifyMediaUrl(storageKey, userId, exp, sig) {
  if (!/^[a-zA-Z0-9._-]+$/.test(storageKey || '')) return false;   // no path traversal
  if (!exp || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const want = Buffer.from(mac(storageKey, exp, userId));
  const got = Buffer.from(String(sig || ''));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

module.exports = { signMediaUrl, verifyMediaUrl, TTL_SEC };
