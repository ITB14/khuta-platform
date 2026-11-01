import { NextResponse } from 'next/server';
const db = require('../../../../../src/db');
const S = require('../../../../../lib/session');
const A = require('../../../../../lib/authz');
const { TABLE } = require('../../../../../lib/catalogue');

/**
 * تعديل تصنيف أو مزوّد: الاسم والترتيب والتفعيل.
 *
 * لا حذف — كالإدارات والمهارات. تصنيفٌ حملته دورةٌ يومًا جزءٌ من سجلّها،
 * والمفتاح المركّب يمنع الحذف أصلًا ما دامت دورةٌ تشير إليه. والتعطيل
 * يُخرجه من قائمة الإسناد ويُبقي ما أُسند.
 */
export async function PATCH(req, { params }) {
  const user = await S.currentUser();
  const denied = A.guardAdmin(user);
  if (denied) return denied;

  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const table = TABLE[b.kind];
  if (!table) {
    return NextResponse.json({ ok: false, error: 'نوع غير معروف' }, { status: 400 });
  }
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const nameAr = has('nameAr') ? String(b.nameAr || '').trim() : null;
  if (has('nameAr') && !nameAr) {
    return NextResponse.json({ ok: false, error: 'الاسم لا يُفرَّغ' }, { status: 400 });
  }

  try {
    const out = await db.withTenant(user.tenant.id, user.id, async (c) => {
      const sortCol = table === 'course_category'
        ? ', sort = case when $6::bool then $7::int else sort end' : '';
      const args = [id, has('nameAr'), nameAr, has('isActive'), b.isActive === true];
      if (table === 'course_category') {
        args.push(has('sort'), Number.isFinite(+b.sort) ? +b.sort : 100);
      }
      const { rows } = await c.query(`
        update ${table} set
          name_ar   = case when $2::bool then $3 else name_ar   end,
          is_active = case when $4::bool then $5 else is_active end
          ${sortCol}
         where id = $1
        returning id, name_ar, is_active`, args);
      if (!rows[0]) return null;
      await db.audit(c, { action: `${b.kind}.update`, objectType: b.kind,
        objectId: id, detail: { fields: Object.keys(b) } });
      return rows[0];
    });
    if (!out) return NextResponse.json({ ok: false, error: 'غير موجود' }, { status: 404 });
    return NextResponse.json({ ok: true, term: out });
  } catch (e) {
    if (e.code === '23505') {
      return NextResponse.json({ ok: false, error: 'يوجد اسم مطابق' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
