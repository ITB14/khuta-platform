'use strict';
// The second factor is verified against the vectors published in RFC 6238,
// Appendix B. If this file ever fails, the authenticator apps in employees'
// pockets have stopped agreeing with us.
const t = require('../src/totp');

const seed1   = Buffer.from('12345678901234567890', 'ascii');                      // sha1,   20 B
const seed256 = Buffer.from('12345678901234567890123456789012', 'ascii');          // sha256, 32 B
const seed512 = Buffer.from('1234567890123456789012345678901234567890123456789012345678901234', 'ascii');

const VECTORS = [
  [59,          '94287082', seed1,   'sha1'],
  [1111111109,  '07081804', seed1,   'sha1'],
  [1111111111,  '14050471', seed1,   'sha1'],
  [1234567890,  '89005924', seed1,   'sha1'],
  [2000000000,  '69279037', seed1,   'sha1'],
  [20000000000, '65353130', seed1,   'sha1'],
  [59,          '46119246', seed256, 'sha256'],
  [1111111109,  '68084774', seed256, 'sha256'],
  [59,          '90693936', seed512, 'sha512'],
  [1111111109,  '25091201', seed512, 'sha512'],
];

let pass = 0, fail = 0;
const ok = (c, label) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`); };

console.log('--- متجهات RFC 6238 ---');
for (const [time, expect, seed, algorithm] of VECTORS) {
  ok(t.totp(seed, { time, digits: 8, algorithm }) === expect,
     `T=${String(time).padEnd(11)} ${algorithm.padEnd(6)} → ${expect}`);
}

console.log('\n--- السلوك ---');
const s = t.generateSecret();
const now = 1700000000;
ok(s.length === 32, 'السرّ 160 بتًا بترميز base32');
ok(t.verify(s, t.totp(s, { time: now }), { time: now }), 'الرمز الحالي يُقبل');
ok(t.verify(s, t.totp(s, { time: now - 30 }), { time: now }), 'ورمز الخطوة السابقة يُقبل — انحراف ساعة الهاتف طبيعي');
ok(!t.verify(s, t.totp(s, { time: now - 120 }), { time: now }), 'ورمز قديم يُرفض');
ok(!t.verify(s, '000000', { time: now }), 'ورمز خاطئ يُرفض');
ok(!t.verify(s, 'abcdef', { time: now }), 'ومدخل غير رقمي يُرفض');
ok(!t.verify(s, '', { time: now }), 'ومدخل فارغ يُرفض');
ok(t.base32Decode(t.base32Encode(Buffer.from('خُطى'))).toString() === 'خُطى', 'ترميز base32 عكوس');
ok(t.provisioningURI({ secret: s, account: 'salem@alain', issuer: 'Khuta' })
    .startsWith('otpauth://totp/Khuta%3Asalem%40alain?'), 'رابط التهيئة بالصيغة المعيارية');

console.log(`\n${'='.repeat(58)}\n  ${pass} PASS · ${fail} FAIL\n${'='.repeat(58)}`);
process.exit(fail ? 1 : 0);
