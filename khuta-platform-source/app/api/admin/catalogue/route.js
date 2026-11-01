import { NextResponse } from 'next/server';
const db = require('../../../../src/db');
const S = require('../../../../lib/session');
const A = require('../../../../lib/authz');
const { TABLE } = require('../../../../lib/catalogue');

/** الكتالوج: الدورات بتصنيفها ومزوّدها، وقائمتا المصطلحات اللتان تُسنَد منهما. */
export async function GET() {
  const user = await S.currentUser();
  const denied = A.guardAdmin(user);
  if (denied) return denied;

  const out = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows: courses } = await c.query(
      'select * from course_catalogue order by title_ar');
    const { rows: categories } = await c.query(`
      select cc.id, cc.name_ar, cc.name_en, cc.sort, cc.is_active,
             (select count(*) from course co where co.category_id = cc.id)::int as courses
        from course_category cc order by cc.sort, cc.name_ar`);
    const { rows: providers } = await c.query(`
      select pr.id, pr.name_ar, pr.name_en, pr.is_active,
             (select count(*) from course co where co.provider_id = pr.id)::int as courses
        from provider pr order by pr.name_ar`);
    return { courses, categories, providers };
  });
  return NextResponse.json({ ok: true, ...out });
}

/** إنشاء تصنيف أو مزوّد. الاسم فريد داخل الجهة — وهذا ما يمنع تكاثر النسخ. */
export async function POST(req) {
  const user = await S.currentUser();
  const denied = A.guardAdmin(user);
  if (denied) return denied;

  const b = await req.json().catch(() => ({}));
  const table = TABLE[b.kind];
  if (!table) {
    return NextResponse.json({ ok: false, error: 'نوع غير معروف' }, { status: 400 });
  }
  const nameAr = String(b.nameAr || '').trim();
  if (!nameAr) {
    return NextResponse.json({ ok: false, error: 'الاسم بالعربية مطلوب' }, { status: 400 });
  }

  try {
    const made = await db.withTenant(user.tenant.id, user.id, async (c) => {
      const cols = table === 'course_category'
        ? '(tenant_id, name_ar, name_en, sort)' : '(tenant_id, name_ar, name_en)';
      const vals = table === 'course_category'
        ? 'current_tenant(), $1, $2, $3' : 'current_tenant(), $1, $2';
      const args = table === 'course_category'
        ? [nameAr, String(b.nameEn || '').trim() || null, Number.isFinite(+b.sort) ? +b.sort : 100]
        : [nameAr, String(b.nameEn || '').trim() || null];
      const { rows } = await c.query(
        `insert into ${table} ${cols} values (${vals}) returning id, name_ar, is_active`, args);
      await db.audit(c, { action: `${b.kind}.create`, objectType: b.kind,
        objectId: rows[0].id, detail: { nameAr } });
      return rows[0];
    });
    return NextResponse.json({ ok: true, term: made });
  } catch (e) {
    if (e.code === '23505') {
      return NextResponse.json({ ok: false, error: `يوجد بهذا الاسم: «${nameAr}»` },
        { status: 409 });
    }
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
