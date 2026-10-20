import { NextResponse } from 'next/server';
const db = require('../../../../../../src/db');
const S = require('../../../../../../lib/session');
const A = require('../../../../../../lib/authz');
const { resetPassword, resetMfa } = require('../../../../../../src/provision');

/**
 * إعادة تعيين وصول متعلّم: كلمة المرور أو المصادقة الثنائية أو كلتاهما.
 *
 * هذا هو الطريق الوحيد اليوم لمن نسي كلمته أو فقد هاتفه، إذ لا بريد في
 * المنصّة بعد. وهو طريق مقصود لا التفاف: مسجَّل في سجلّ التدقيق باسم من
 * نفّذه، ويُبطل جلسات صاحب الحساب، ويضع كلمة مؤقّتة يُجبَر على تغييرها.
 *
 * ولا يُعاد تعيين حساب يحمل دورًا إداريًّا من هنا: رفع صلاحية أو انتزاعها
 * لا يمرّ بشاشة قائمة المتعلّمين.
 */
export async function POST(req, { params }) {
  const actor = await S.currentUser();
  const denied = A.guardAdmin(actor);
  if (denied) return denied;

  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const doPassword = b.password !== false;
  const doMfa = b.mfa === true;

  try {
    const out = await db.withTenant(actor.tenant.id, actor.id, async (c) => {
      const { rows } = await c.query(`
        select u.id, u.email, u.full_name_ar,
               exists (select 1 from user_role_grant g
                        where g.user_id = u.id and g.role <> 'learner') as privileged
          from app_user u where u.id = $1`, [id]);
      const u = rows[0];
      if (!u) { const e = new Error('لا يوجد متعلّم بهذا المعرّف'); e.code = 404; throw e; }
      if (u.privileged) {
        const e = new Error('هذا الحساب يحمل دورًا إداريًّا ولا يُعاد تعيينه من هنا.');
        e.code = 403; throw e;
      }

      const via = `admin:${actor.email}`;
      const res = { email: u.email, fullNameAr: u.full_name_ar };
      if (doPassword) Object.assign(res, await resetPassword(c, u.id, { via }));
      if (doMfa) Object.assign(res, await resetMfa(c, u.id, { email: u.email, via }));
      return res;
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.code || 400 });
  }
}
