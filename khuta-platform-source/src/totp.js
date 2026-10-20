'use strict';
// RFC 6238 (TOTP) over RFC 4226 (HOTP), on node:crypto alone.
//
// Why not a package: this is the second authentication factor for a government
// platform. The dependency we tried changes its API between majors and pulls in
// its own crypto plugins; the algorithm itself is forty lines and is verified
// below against the test vectors published in RFC 6238 Appendix B.
const crypto = require('node:crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;                                   // no padding: authenticator apps dislike it
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32 character');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function generateSecret(bytes = 20) {        // 160 bits, the RFC 4226 recommendation
  return base32Encode(crypto.randomBytes(bytes));
}

function hotp(secretBytes, counter, digits = 6, algorithm = 'sha1') {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac(algorithm, secretBytes).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;   // dynamic truncation
  const code = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16)
             | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
}

function totp(secret, { time = Date.now() / 1000, period = 30, digits = 6, algorithm = 'sha1' } = {}) {
  const key = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  return hotp(key, Math.floor(time / period), digits, algorithm);
}

// window=1 accepts the previous and next step: clock drift on a phone is normal.
function verify(secret, token, { time = Date.now() / 1000, period = 30, digits = 6, algorithm = 'sha1', window = 1 } = {}) {
  const given = String(token || '').replace(/\s/g, '');
  if (!new RegExp(`^\\d{${digits}}$`).test(given)) return false;
  const key = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  const step = Math.floor(time / period);
  let ok = false;
  for (let i = -window; i <= window; i++) {    // no early return: constant number of comparisons
    const expected = hotp(key, step + i, digits, algorithm);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) ok = true;
  }
  return ok;
}

function provisioningURI({ secret, account, issuer, digits = 6, period = 30, algorithm = 'SHA1' }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const p = new URLSearchParams({ secret, issuer, algorithm, digits: String(digits), period: String(period) });
  return `otpauth://totp/${label}?${p.toString()}`;
}

module.exports = { generateSecret, base32Encode, base32Decode, hotp, totp, verify, provisioningURI };
