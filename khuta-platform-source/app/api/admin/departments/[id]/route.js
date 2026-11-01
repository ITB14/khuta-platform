import { NextResponse } from 'next/server';
const db = require('../../../../../src/db');
const S = require('../../../../../lib/session');
const A = require('../../../../../lib/authz');

/**
 * تعديل إدارة: الاسم، الأمّ، التفعيل.
 *
 * لا حذف. إدارة حملت موظفًا يومًا هي جزء من سجلّ تدريبه، وحذفها يجعل تقارير
 * الأمس تشير إلى لا شيء. التعطيل يُخرجها من قوائم الاختيار ويُبقي التاريخ.
 */
export async function PATCH(req, { params }) {
  const user = await S.currentUser();
  const denied = A.guardAdmin(user);
  if (denied) return denied;

  const { id } = await params;
  const b = await req.json().catch(() => ({}));

  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const nameAr = has('nameAr') ? String(b.nameAr || '').trim() : null;
  if (has('nameAr') && !nameAr) {
    return NextResponse.json({ ok: false, error: 'اسم الإدارة لا يُفرَّغ' }, { status: 400 });
  }

  try {
    const out = await db.withTenant(user.tenant.id, user.id, async (c) => {
      // case when لا coalesce: الفرق بين حقل أُرسل فارغًا وحقل لم يُرسل.
      const { rows } = await c.query(`
        update department set
          name_ar   = case when $2::bool then $3  else name_ar   end,
          name_en   = case when $4::bool then $5  else name_en   end,
          code      = case when $6::bool then $7  else code      end,
          parent_id = case when $8::bool then $9::uuid else parent_id end,
          is_active = case when $10::bool then $11 else is_active end
         where id = $1
        returning id, name_ar, name_en, code, is_active, parent_id`,
        [id,
         has('nameAr'), nameAr,
         has('nameEn'), String(b.nameEn || '').trim() || null,
         has('code'), String(b.code || '').trim() || null,
         has('parentId'), String(b.parentId || '').trim() || null,
         has('isActive'), b.isActive === true]);
      if (!rows[0]) return null;
      await db.audit(c, { action: 'department.update', objectType: 'department',
        objectId: id, detail: { fields: Object.keys(b) } });
      return rows[0];
    });

    if (!out) return NextResponse.json({ ok: false, error: 'غير موجودة' }, { status: 404 });
    return NextResponse.json({ ok: true, department: out });
  } catch (e) {
    if (e.code === '23505') {
      return NextResponse.json({ ok: false, error: 'يوجد اسم إدارة مطابق' }, { status: 409 });
    }
    // الحلقة في التسلسل تأتي من المُحفِّزة برسالة عربية جاهزة.
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
