import { NextResponse } from 'next/server';
const db = require('../../../../src/db');
const S = require('../../../../lib/session');
const A = require('../../../../lib/authz');

/** كتالوج المهارات — قراءة وإنشاء. الاسم فريد داخل الجهة، كالإدارات. */
export async function GET() {
  const user = await S.currentUser();
  const denied = A.guardAdmin(user);
  if (denied) return denied;

  const rows = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows } = await c.query(
      `select * from skill_demand order by wants desc, declared desc, name_ar`);
    return rows;
  });
  return NextResponse.json({ ok: true, skills: rows });
}

export async function POST(req) {
  const user = await S.currentUser();
  const denied = A.guardAdmin(user);
  if (denied) return denied;

  const b = await req.json().catch(() => ({}));
  const nameAr = String(b.nameAr || '').trim();
  if (!nameAr) {
    return NextResponse.json({ ok: false, error: 'اسم المهارة مطلوب' }, { status: 400 });
  }

  try {
    const made = await db.withTenant(user.tenant.id, user.id, async (c) => {
      const { rows } = await c.query(`
        insert into skill (tenant_id, name_ar, name_en, category)
        values (current_tenant(), $1, $2, $3)
        returning id, name_ar, name_en, category, is_active`,
        [nameAr, String(b.nameEn || '').trim() || null,
         String(b.category || '').trim() || null]);
      await db.audit(c, { action: 'skill.create', objectType: 'skill',
        objectId: rows[0].id, detail: { nameAr } });
      return rows[0];
    });
    return NextResponse.json({ ok: true, skill: made });
  } catch (e) {
    if (e.code === '23505') {
      return NextResponse.json({ ok: false, error: `توجد مهارة بهذا الاسم: «${nameAr}»` },
        { status: 409 });
    }
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
