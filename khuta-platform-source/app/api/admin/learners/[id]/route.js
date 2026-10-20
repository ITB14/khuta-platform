import { NextResponse } from 'next/server';
const db = require('../../../../../src/db');
const identity = require('../../../../../src/identity');
const S = require('../../../../../lib/session');
const A = require('../../../../../lib/authz');

const STATUSES = ['active', 'suspended'];

/**
 * تعديل بيانات متعلّم أو إيقافه.
 *
 * البريد لا يُعدَّل من هنا: هو هويّة الحساب ومرجع سجلّ التدقيق، وتغييره
 * يجعل سطور السجلّ القديمة تشير إلى شخص بعنوان آخر. من أراد بريدًا جديدًا
 * فحساب جديد.
 *
 * والإيقاف يسري في اللحظة نفسها — `validateSession` ترفض حسابًا غير نشط —
 * ومع ذلك تُبطَل جلساته صراحةً كي لا يبقى الأثر معلّقًا في الجدول.
 */
export async function PATCH(req, { params }) {
  const actor = await S.currentUser();
  const denied = A.guardAdmin(actor);
  if (denied) return denied;

  const { id } = await params;
  const b = await req.json().catch(() => ({}));

  const fullNameAr = b.fullNameAr === undefined ? undefined : String(b.fullNameAr).trim();
  if (fullNameAr !== undefined && !fullNameAr) {
    return NextResponse.json({ ok: false, error: 'الاسم لا يكون فارغًا.' }, { status: 400 });
  }
  if (b.status !== undefined && !STATUSES.includes(String(b.status))) {
    return NextResponse.json({ ok: false, error: 'حالة غير معروفة.' }, { status: 400 });
  }

  try {
    const out = await db.withTenant(actor.tenant.id, actor.id, async (c) => {
      const { rows } = await c.query(`
        select u.id, u.email, u.status,
               exists (select 1 from user_role_grant g
                        where g.user_id = u.id and g.role <> 'learner') as privileged
          from app_user u where u.id = $1`, [id]);
      const u = rows[0];
      if (!u) { const e = new Error('لا يوجد متعلّم بهذا المعرّف'); e.code = 404; throw e; }
      if (u.privileged) {
        const e = new Error('هذا الحساب يحمل دورًا إداريًّا ولا يُعدَّل من هنا.');
        e.code = 403; throw e;
      }
      if (u.id === actor.id) {
        const e = new Error('لا تُعدّل حسابك من هذه الشاشة.'); e.code = 403; throw e;
      }

      // `case when <أُرسل> then <القيمة> else <كما هو> end` لا `coalesce`:
      // الفرق أن حقلًا أُرسل فارغًا يُمسح، وحقلًا لم يُرسل أصلًا يبقى.
      // مع coalesce يستحيل مسح «الإدارة» بعد كتابتها، ويبدو الحفظ ناجحًا.
      const opt = (v) => (v === undefined ? null : String(v).trim() || null);
      const { rows: saved } = await c.query(`
        update app_user set
          full_name_ar = case when $2::bool then $3 else full_name_ar end,
          employee_no  = case when $4::bool then $5 else employee_no  end,
          department   = case when $6::bool then $7 else department   end,
          job_title    = case when $8::bool then $9 else job_title    end,
          status       = case when $10::bool then $11 else status     end,
          updated_at   = now()
        where id = $1
        returning id, email, full_name_ar, employee_no, department, job_title, status`,
        [id,
         fullNameAr !== undefined, fullNameAr ?? null,
         b.employeeNo !== undefined, opt(b.employeeNo),
         b.department !== undefined, opt(b.department),
         b.jobTitle !== undefined, opt(b.jobTitle),
         b.status !== undefined, b.status === undefined ? null : String(b.status)]);

      if (b.status === 'suspended' && u.status !== 'suspended') {
        await identity.revokeAllSessions(c, id);
      }

      await db.audit(c, {
        action: b.status && b.status !== u.status ? `user.${b.status}` : 'user.updated',
        objectType: 'app_user', objectId: id,
        detail: { email: u.email, by: actor.email, status: saved[0].status },
      });
      return saved[0];
    });
    return NextResponse.json({ ok: true, learner: out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.code || 400 });
  }
}
