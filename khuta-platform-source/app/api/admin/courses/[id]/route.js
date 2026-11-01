import { NextResponse } from 'next/server';
const db = require('../../../../../src/db');
const S = require('../../../../../lib/session');
const A = require('../../../../../lib/authz');

/**
 * إسناد التصنيف والمزوّد إلى دورة.
 *
 * لا يُعدَّل هنا شيءٌ من محتوى الدورة — العنوان والدروس والأسئلة تأتي من
 * التحميل لا من نموذج في صفحة. هذان حقلان تصنيفيّان فقط.
 *
 * والمعطَّل لا يُسنَد: تصنيفٌ أُخرج من القائمة لا يُعاد إليها من الخلف.
 * أمّا ما أُسند قبل التعطيل فيبقى، ولذلك يُفحص الوارد لا القائم.
 */
export async function PATCH(req, { params }) {
  const user = await S.currentUser();
  const denied = A.guardAdmin(user);
  if (denied) return denied;

  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  if (!has('categoryId') && !has('providerId')) {
    return NextResponse.json({ ok: false, error: 'لا شيء ليُسنَد' }, { status: 400 });
  }
  // فارغ يعني فكّ الإسناد، لا إسنادًا إلى معرّف فارغ.
  const catId = has('categoryId') ? (String(b.categoryId || '').trim() || null) : null;
  const provId = has('providerId') ? (String(b.providerId || '').trim() || null) : null;

  try {
    const out = await db.withTenant(user.tenant.id, user.id, async (c) => {
      for (const [table, value, label] of [
        ['course_category', catId, 'التصنيف'], ['provider', provId, 'المزوّد'],
      ]) {
        if (!value) continue;
        const { rows } = await c.query(
          `select is_active from ${table} where id = $1`, [value]);
        if (!rows[0]) throw Object.assign(new Error(`${label} غير موجود`), { http: 404 });
        if (!rows[0].is_active) {
          throw Object.assign(new Error(`${label} معطَّل ولا يُسنَد`), { http: 400 });
        }
      }
      const { rows } = await c.query(`
        update course set
          category_id = case when $2::bool then $3::uuid else category_id end,
          provider_id = case when $4::bool then $5::uuid else provider_id end
         where id = $1
        returning id, title_ar, category_id, provider_id`,
        [id, has('categoryId'), catId, has('providerId'), provId]);
      if (!rows[0]) return null;
      await db.audit(c, { action: 'course.classify', objectType: 'course',
        objectId: id, detail: { categoryId: catId, providerId: provId } });
      return rows[0];
    });
    if (!out) return NextResponse.json({ ok: false, error: 'الدورة غير موجودة' }, { status: 404 });
    return NextResponse.json({ ok: true, course: out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.http || 400 });
  }
}
