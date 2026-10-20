'use strict';
// Cookies and the request-scoped tenant. Nothing here trusts the client:
// the session cookie is an opaque random token (the database holds only its
// hash) and the half-authenticated state between password and second factor
// is an HMAC-signed, short-lived value, not a user id the browser could edit.
const crypto = require('node:crypto');
const { cookies, headers } = require('next/headers');
const db = require('../src/db');
const identity = require('../src/identity');

const SESSION_COOKIE = 'khuta_session';
const PENDING_COOKIE = 'khuta_mfa_pending';
const PENDING_TTL_SEC = 300;              // five minutes to type six digits

function secret() {
  const s = process.env.KHUTA_SECRET;
  if (!s) throw new Error('KHUTA_SECRET is not set');
  return s;
}
const b64u = (b) => Buffer.from(b).toString('base64url');

function signPending(userId) {
  const body = `${userId}.${Math.floor(Date.now() / 1000) + PENDING_TTL_SEC}`;
  const mac = crypto.createHmac('sha256', secret()).update(body).digest();
  return `${b64u(body)}.${b64u(mac)}`;
}

function verifyPending(value) {
  if (!value || typeof value !== 'string') return null;
  const [b, m] = value.split('.');
  if (!b || !m) return null;
  const body = Buffer.from(b, 'base64url').toString();
  const want = crypto.createHmac('sha256', secret()).update(body).digest();
  const got = Buffer.from(m, 'base64url');
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  const [userId, exp] = body.split('.');
  if (!userId || Number(exp) < Math.floor(Date.now() / 1000)) return null;
  return userId;
}

const cookieOpts = (maxAge) => ({
  httpOnly: true, sameSite: 'lax', path: '/',
  secure: process.env.NODE_ENV === 'production', maxAge,
});

/** The tenant for this request, from the Host header. */
async function requestTenant() {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || '';
  const t = await db.resolveTenant(host, process.env.KHUTA_DEFAULT_TENANT || 'alain');
  if (!t) throw new Error(`no active tenant for host "${host}"`);
  return t;
}

/** The signed-in user, or null. */
async function currentUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tenant = await requestTenant();
  return db.withTenant(tenant.id, null, async (c) => {
    const s = await identity.validateSession(c, token);
    if (!s) return null;
    // الأدوار تُقرأ مع الجلسة لا من الكوكي: المتصفّح لا يحمل صلاحية قطّ، وسحب
    // دور من مستخدم يسري على طلبه التالي دون انتظار انتهاء جلسته.
    const { rows } = await c.query(
      'select role from user_role_grant where user_id = $1 order by role', [s.user.id]);
    return { ...s.user, tenant, roles: rows.map((r) => r.role) };
  });
}

module.exports = {
  SESSION_COOKIE, PENDING_COOKIE, PENDING_TTL_SEC,
  signPending, verifyPending, cookieOpts, requestTenant, currentUser,
};
