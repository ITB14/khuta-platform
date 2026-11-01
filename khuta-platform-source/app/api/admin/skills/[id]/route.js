import { NextResponse } from 'next/server';
const db = require('../../../../../src/db');
const S = require('../../../../../lib/session');
const A = require('../../../../../lib/authz');

/**
 * تعديل مهارة: الاسم، التصنيف، التفعيل.
 *
 * لا حذف — كما الإدارات. مهارةٌ أعلنها موظف جزءٌ من جرد الجهة، وحذفها يُسقط
 * إعلانه معها. التعطيل يُخرجها من قائمة الإضافة ويُبقي ما أُعلن.
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
    return NextResponse.json({ ok: false, error: 'اسم المهارة لا يُفرَّغ' }, { status: 400 });
  }

  try {
    const out = await db.withTenant(user.tenant.id, user.id, async (c) => {
      const { rows } = await c.query(`
        update skill set
          name_ar   = case when $2::bool then $3 else name_ar   end,
          name_en   = case when $4::bool then $5 else name_en   end,
          category  = case when $6::bool then $7 else category  end,
          is_active = case when $8::bool then $9 else is_active end
         where id = $1
        returning id, name_ar, name_en, category, is_active`,
        [id, has('nameAr'), nameAr,
         has('nameEn'), String(b.nameEn || '').trim() || null,
         has('category'), String(b.category || '').trim() || null,
         has('isActive'), b.isActive === true]);
      if (!rows[0]) return null;
      await db.audit(c, { action: 'skill.update', objectType: 'skill',
        objectId: id, detail: { fields: Object.keys(b) } });
      return rows[0];
    });
    if (!out) return NextResponse.json({ ok: false, error: 'غير موجودة' }, { status: 404 });
    return NextResponse.json({ ok: true, skill: out });
  } catch (e) {
    if (e.code === '23505') {
      return NextResponse.json({ ok: false, error: 'يوجد اسم مهارة مطابق' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
