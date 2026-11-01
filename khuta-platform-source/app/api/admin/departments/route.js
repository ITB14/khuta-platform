import { NextResponse } from 'next/server';
const db = require('../../../../src/db');
const S = require('../../../../lib/session');
const A = require('../../../../lib/authz');

/**
 * الإدارات — إنشاء وقراءة.
 *
 * الاسم فريد داخل الجهة، وقاعدة البيانات هي من يفرض ذلك. فإن سبق الاسمُ
 * نفسه، عاد الردّ بأنه موجود لا بخطأ غامض — والمسؤول في هذه الحالة أراد
 * إضافة ما هو مضاف، لا أخطأ في شيء.
 */
export async function GET() {
  const user = await S.currentUser();
  const denied = A.guardAdmin(user);
  if (denied) return denied;

  const rows = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows } = await c.query(`
      select d.id, d.name_ar, d.name_en, d.code, d.is_active, d.parent_id,
             p.name_ar as parent_name,
             (select count(*) from app_user u where u.department_id = d.id)::int as learners
        from department d
        left join department p on p.id = d.parent_id
       order by coalesce(p.name_ar, d.name_ar), (d.parent_id is not null), d.name_ar`);
    return rows;
  });
  return NextResponse.json({ ok: true, departments: rows });
}

export async function POST(req) {
  const user = await S.currentUser();
  const denied = A.guardAdmin(user);
  if (denied) return denied;

  const b = await req.json().catch(() => ({}));
  const nameAr = String(b.nameAr || '').trim();
  const nameEn = String(b.nameEn || '').trim() || null;
  const code = String(b.code || '').trim() || null;
  const parentId = String(b.parentId || '').trim() || null;

  if (!nameAr) {
    return NextResponse.json({ ok: false, error: 'اسم الإدارة مطلوب' }, { status: 400 });
  }

  try {
    const made = await db.withTenant(user.tenant.id, user.id, async (c) => {
      const { rows } = await c.query(`
        insert into department (tenant_id, name_ar, name_en, code, parent_id)
        values (current_tenant(), $1, $2, $3, $4)
        returning id, name_ar, name_en, code, is_active, parent_id`,
        [nameAr, nameEn, code, parentId]);
      await db.audit(c, { action: 'department.create', objectType: 'department',
        objectId: rows[0].id, detail: { nameAr } });
      return rows[0];
    });
    return NextResponse.json({ ok: true, department: made });
  } catch (e) {
    if (e.code === '23505') {
      return NextResponse.json({ ok: false, error: `توجد إدارة بهذا الاسم: «${nameAr}»` },
        { status: 409 });
    }
    if (e.code === '23503') {
      return NextResponse.json({ ok: false, error: 'الإدارة الأمّ غير موجودة في جهتك' },
        { status: 400 });
    }
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
