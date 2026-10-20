import { NextResponse } from 'next/server';
const db = require('../../../../src/db');
const identity = require('../../../../src/identity');
const S = require('../../../../lib/session');

export async function POST(req) {
  const { email, password } = await req.json().catch(() => ({}));
  const tenant = await S.requestTenant();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || null;
  const ua = req.headers.get('user-agent') || null;

  const result = await db.withTenant(tenant.id, null, async (c) => {
    const r = await identity.authenticate(c, { email, password, ip });
    if (!r.ok) return r;
    if (r.mfaRequired) return r;                       // no session until the second factor
    const s = await identity.createSession(c, r.userId, { ip, userAgent: ua });
    return { ...r, session: s };
  });

  if (!result.ok) {
    // One message for a wrong password and for an address that does not exist.
    const msg = result.reason === 'locked'
      ? 'أُقفل الحساب مؤقتًا بعد عدة محاولات فاشلة. حاول بعد قليل.'
      : result.reason === 'suspended'
        ? 'هذا الحساب موقوف. راجع إدارة تقنية المعلومات.'
        : 'بيانات الدخول غير صحيحة.';
    return NextResponse.json({ ok: false, message: msg }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, next: result.mfaRequired ? '/signin/mfa' : '/dashboard' });
  if (result.mfaRequired) {
    res.cookies.set(S.PENDING_COOKIE, S.signPending(result.userId), S.cookieOpts(S.PENDING_TTL_SEC));
  } else {
    res.cookies.set(S.SESSION_COOKIE, result.session.token, S.cookieOpts(12 * 3600));
  }
  return res;
}
