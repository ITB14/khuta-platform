import { NextResponse } from 'next/server';
const db = require('../../../../src/db');
const identity = require('../../../../src/identity');
const S = require('../../../../lib/session');

export async function POST(req) {
  const { code } = await req.json().catch(() => ({}));
  const pending = req.cookies.get(S.PENDING_COOKIE)?.value;
  const userId = S.verifyPending(pending);
  if (!userId) {
    return NextResponse.json(
      { ok: false, message: 'انتهت مهلة الإدخال. أعد تسجيل الدخول.' }, { status: 440 });
  }

  const tenant = await S.requestTenant();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || null;
  const ua = req.headers.get('user-agent') || null;

  const out = await db.withTenant(tenant.id, userId, async (c) => {
    if (!(await identity.verifyMfa(c, userId, code))) return null;
    return identity.createSession(c, userId, { ip, userAgent: ua });
  });

  if (!out) return NextResponse.json({ ok: false, message: 'الرمز غير صحيح.' }, { status: 401 });

  const res = NextResponse.json({ ok: true, next: '/dashboard' });
  res.cookies.set(S.SESSION_COOKIE, out.token, S.cookieOpts(12 * 3600));
  res.cookies.set(S.PENDING_COOKIE, '', S.cookieOpts(0));
  return res;
}
