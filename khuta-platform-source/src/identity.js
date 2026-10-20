'use strict';
// Identity: passwords, second factor, lockout, sessions.
//
// The whole module sits behind one surface so that federating to the entity's
// own directory later is a contained change. Nothing outside this file knows
// how a credential is checked — callers ask authenticate() and get a verdict.
const crypto = require('node:crypto');
const argon2 = require('@node-rs/argon2');
const totp = require('./totp');
const { audit } = require('./db');

// OWASP argon2id parameters. Measured at ~9 ms on this machine: slow enough to
// make offline cracking expensive, fast enough not to be a login bottleneck.
const ARGON = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 };

const LOCKOUT = { threshold: 5, baseMinutes: 15, maxMinutes: 240 };
const SESSION_HOURS = 12;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest();

// TOTP secrets are encrypted at rest. The key lives outside the database, so a
// stolen dump alone does not hand over anyone's second factor.
function mfaKey() {
  const k = process.env.KHUTA_MFA_KEY;
  if (!k) throw new Error('KHUTA_MFA_KEY is not set — refusing to store a secret in the clear');
  const buf = Buffer.from(k, 'base64');
  if (buf.length !== 32) throw new Error('KHUTA_MFA_KEY must be 32 bytes, base64-encoded');
  return buf;
}
function seal(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', mfaKey(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]);
}
function open(blob) {
  const b = Buffer.from(blob);
  const d = crypto.createDecipheriv('aes-256-gcm', mfaKey(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

// ----------------------------------------------------------------- users ---
async function createUser(c, { email, fullNameAr, fullNameEn = null, employeeNo = null,
                               department = null, jobTitle = null, status = 'invited' }) {
  const { rows } = await c.query(
    `insert into app_user (tenant_id, email, employee_no, full_name_ar, full_name_en,
                           department, job_title, status)
     values (current_tenant(), $1,$2,$3,$4,$5,$6,$7) returning *`,
    [email, employeeNo, fullNameAr, fullNameEn, department, jobTitle, status]);
  await audit(c, { action: 'user.create', objectType: 'app_user', objectId: rows[0].id,
                   detail: { email } });
  return rows[0];
}

// mustChange يُرفع حين تكون كلمة المرور مؤقّتة وضعها غير صاحبها — عند إنشاء
// الحساب أو إعادة التعيين. والمنصّة تمنع التقدّم قبل تغييرها، فكلمة مرور مرّت
// بيد ثالثة لا تبقى كلمة مرور.
async function setPassword(c, userId, password, { mustChange = false } = {}) {
  const problems = passwordProblems(password);
  if (problems.length) { const e = new Error('weak password'); e.problems = problems; throw e; }
  const hash = await argon2.hash(password, ARGON);
  await c.query(
    `insert into user_credential (user_id, tenant_id, password_hash, password_algo, must_change)
     values ($1, current_tenant(), $2, 'argon2id', $3)
     on conflict (user_id) do update
       set password_hash = excluded.password_hash, password_updated_at = now(),
           must_change = excluded.must_change`,
    [userId, hash, mustChange]);
  await c.query(`update app_user set status = 'active', updated_at = now()
                  where id = $1 and status = 'invited'`, [userId]);
  await audit(c, { action: 'user.password_set', objectType: 'app_user', objectId: userId,
                   detail: { mustChange } });
}

/**
 * تحقّق من كلمة مرور مستخدم معروف الهويّة — لتأكيد صاحب الجلسة قبل تغييرها.
 * ليس مسار دخول: لا يسجّل محاولة ولا يقفل الحساب، لأن من يغيّر كلمته قد
 * أثبت هويّته بالفعل، وإقفاله لخطأ مطبعي هنا عقوبة بلا سبب.
 */
async function checkPassword(c, userId, password) {
  const { rows } = await c.query(
    'select password_hash from user_credential where user_id = $1', [userId]);
  if (!rows[0]?.password_hash) return false;
  return argon2.verify(rows[0].password_hash, password || '').catch(() => false);
}

function passwordProblems(pw) {
  const p = [];
  if (!pw || pw.length < 12) p.push('أقل من 12 محرفًا');
  if (!/[a-z]/.test(pw || '') || !/[A-Z]/.test(pw || '')) p.push('بلا حرف صغير وكبير');
  if (!/\d/.test(pw || '')) p.push('بلا رقم');
  return p;
}

// -------------------------------------------------------------- lockout ----
async function lockoutState(c, userId) {
  const { rows } = await c.query(
    'select failed_count, locked_until from user_lockout where user_id = $1', [userId]);
  const r = rows[0] || { failed_count: 0, locked_until: null };
  return { ...r, locked: !!(r.locked_until && new Date(r.locked_until) > new Date()) };
}

async function noteFailure(c, userId) {
  const { rows } = await c.query(
    `insert into user_lockout (user_id, tenant_id, failed_count)
     values ($1, current_tenant(), 1)
     on conflict (user_id) do update set failed_count = user_lockout.failed_count + 1
     returning failed_count`, [userId]);
  const n = rows[0].failed_count;
  if (n >= LOCKOUT.threshold) {
    // Doubling back-off: 15, 30, 60 … capped. A guessing script stops being
    // worth running long before a locked-out employee gives up on the day.
    const mins = Math.min(LOCKOUT.baseMinutes * 2 ** (n - LOCKOUT.threshold), LOCKOUT.maxMinutes);
    await c.query(
      `update user_lockout set locked_until = now() + make_interval(mins => $2) where user_id = $1`,
      [userId, mins]);
    await audit(c, { action: 'user.locked', objectType: 'app_user', objectId: userId,
                     detail: { failed_count: n, minutes: mins } });
    return { locked: true, minutes: mins };
  }
  return { locked: false, remaining: LOCKOUT.threshold - n };
}

const clearFailures = (c, userId) =>
  c.query(`update user_lockout set failed_count = 0, locked_until = null where user_id = $1`, [userId]);

// ------------------------------------------------------- authentication ----
async function authenticate(c, { email, password, ip = null }) {
  const { rows } = await c.query(
    `select u.id, u.status, u.identity_provider, cr.password_hash,
            (m.user_id is not null and m.confirmed_at is not null) as mfa_enabled
       from app_user u
       left join user_credential cr on cr.user_id = u.id
       left join user_mfa m on m.user_id = u.id
      where lower(u.email) = lower($1)`, [email]);
  const u = rows[0];

  const record = (ok, userId = null) => c.query(
    `insert into login_attempt (tenant_id, user_id, email_attempted, ip, success)
     values (current_tenant(), $1, $2, $3, $4)`, [userId, email, ip, ok]);

  // Unknown account: still spend the time, so response timing does not reveal
  // which addresses exist.
  if (!u || !u.password_hash) {
    await argon2.hash('timing equalisation', ARGON).catch(() => {});
    await record(false);
    return { ok: false, reason: 'invalid_credentials' };
  }
  if (u.status === 'suspended') { await record(false, u.id); return { ok: false, reason: 'suspended' }; }

  const lock = await lockoutState(c, u.id);
  if (lock.locked) {
    await record(false, u.id);
    return { ok: false, reason: 'locked', lockedUntil: lock.locked_until };
  }

  const good = await argon2.verify(u.password_hash, password).catch(() => false);
  if (!good) {
    const l = await noteFailure(c, u.id);
    await record(false, u.id);
    return { ok: false, reason: 'invalid_credentials', ...l };
  }

  await clearFailures(c, u.id);
  await record(true, u.id);
  // Password alone is never a completed login when a second factor exists.
  return { ok: true, userId: u.id, mfaRequired: u.mfa_enabled, identityProvider: u.identity_provider };
}

// ---------------------------------------------------------- second factor --
async function beginMfaEnrolment(c, userId, { account, issuer = 'Khuta' }) {
  const secret = totp.generateSecret();
  await c.query(
    `insert into user_mfa (user_id, tenant_id, totp_secret_enc)
     values ($1, current_tenant(), $2)
     on conflict (user_id) do update set totp_secret_enc = excluded.totp_secret_enc, confirmed_at = null`,
    [userId, seal(secret)]);
  await audit(c, { action: 'mfa.enrol_begin', objectType: 'app_user', objectId: userId });
  return { secret, uri: totp.provisioningURI({ secret, account, issuer }) };
}

async function confirmMfaEnrolment(c, userId, token) {
  const { rows } = await c.query('select totp_secret_enc from user_mfa where user_id = $1', [userId]);
  if (!rows[0]) return { ok: false, reason: 'not_enrolled' };
  if (!totp.verify(open(rows[0].totp_secret_enc), token)) return { ok: false, reason: 'bad_token' };
  await c.query('update user_mfa set confirmed_at = now() where user_id = $1', [userId]);
  await audit(c, { action: 'mfa.enrol_confirm', objectType: 'app_user', objectId: userId });
  return { ok: true };
}

async function verifyMfa(c, userId, token) {
  const { rows } = await c.query(
    'select totp_secret_enc from user_mfa where user_id = $1 and confirmed_at is not null', [userId]);
  if (!rows[0]) return false;
  return totp.verify(open(rows[0].totp_secret_enc), token);
}

// --------------------------------------------------------------- sessions --
// The browser holds an opaque random token; the database holds only its
// SHA-256. A stolen dump yields no usable session.
async function createSession(c, userId, { ip = null, userAgent = null, hours = SESSION_HOURS } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const { rows } = await c.query(
    `insert into user_session (tenant_id, user_id, token_hash, expires_at, ip, user_agent)
     values (current_tenant(), $1, $2, now() + make_interval(hours => $3), $4, $5)
     returning id, expires_at`,
    [userId, sha256(token), hours, ip, userAgent]);
  await audit(c, { action: 'session.create', objectType: 'user_session', objectId: rows[0].id, ip });
  return { token, sessionId: rows[0].id, expiresAt: rows[0].expires_at };
}

async function validateSession(c, token) {
  if (!token) return null;
  const { rows } = await c.query(
    `update user_session s set last_seen_at = now()
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
      returning s.id, s.user_id`, [sha256(token)]);
  if (!rows[0]) return null;
  const { rows: u } = await c.query(
    `select id, full_name_ar, email, status from app_user where id = $1`, [rows[0].user_id]);
  return u[0] && u[0].status === 'active' ? { sessionId: rows[0].id, user: u[0] } : null;
}

async function revokeSession(c, token) {
  const { rowCount } = await c.query(
    `update user_session set revoked_at = now()
      where token_hash = $1 and revoked_at is null`, [sha256(token)]);
  if (rowCount) await audit(c, { action: 'session.revoke' });
  return rowCount > 0;
}

const revokeAllSessions = (c, userId) =>
  c.query(`update user_session set revoked_at = now() where user_id = $1 and revoked_at is null`, [userId]);

module.exports = {
  ARGON, LOCKOUT, SESSION_HOURS,
  createUser, setPassword, passwordProblems, checkPassword,
  authenticate, lockoutState,
  beginMfaEnrolment, confirmMfaEnrolment, verifyMfa,
  createSession, validateSession, revokeSession, revokeAllSessions,
};
