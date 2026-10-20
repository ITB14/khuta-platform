import { NextResponse } from 'next/server';
const db = require('../../../../src/db');
const identity = require('../../../../src/identity');
const S = require('../../../../lib/session');

/**
 * تغيير كلمة المرور بيد صاحبها.
 *
 * يُطلب الحالية ولو كان التغيير إجباريًّا: الجلسة قد تكون مفتوحة على جهاز
 * تركه صاحبه، ومعرفة الكلمة الحالية هي ما يميّز صاحبها عمّن جلس بعده.
 *
 * وبعد التغيير تُبطَل كل الجلسات وتُفتح واحدة جديدة لهذا المتصفّح — فمن كان
 * يعرف الكلمة القديمة ويملك جلسة قائمة يخرج منها فورًا.
 */
export async function POST(req) {
  const user = await S.currentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const current = String(b.currentPassword || '');
  const next = String(b.newPassword || '');

  if (!current || !next) {
    return NextResponse.json({ ok: false, error: 'أدخل كلمة المرور الحالية والجديدة.' }, { status: 400 });
  }
  if (current === next) {
    return NextResponse.json({ ok: false, error: 'الكلمة الجديدة مطابقة للحالية.' }, { status: 400 });
  }
  const problems = identity.passwordProblems(next);
  if (problems.length) {
    return NextResponse.json({ ok: false, error: `كلمة المرور ${problems.join('، ')}.` }, { status: 400 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || null;
  const ua = req.headers.get('user-agent') || null;

  const out = await db.withTenant(user.tenant.id, user.id, async (c) => {
    if (!(await identity.checkPassword(c, user.id, current))) return null;
    await identity.setPassword(c, user.id, next, { mustChange: false });
    await identity.revokeAllSessions(c, user.id);
    await db.audit(c, { action: 'user.password_changed', objectType: 'app_user',
                        objectId: user.id, ip });
    return identity.createSession(c, user.id, { ip, userAgent: ua });
  });

  if (!out) {
    return NextResponse.json({ ok: false, error: 'كلمة المرور الحالية غير صحيحة.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, next: '/dashboard' });
  res.cookies.set(S.SESSION_COOKIE, out.token, S.cookieOpts(12 * 3600));
  return res;
}
