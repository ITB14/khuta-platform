import { NextResponse } from 'next/server';
const db = require('../../../../src/db');
const S = require('../../../../lib/session');
const A = require('../../../../lib/authz');
const { provisionLearner } = require('../../../../src/provision');

/**
 * إنشاء متعلّم وتسجيله.
 *
 * المنادي لا يختار الدور: provisionLearner يمنح `learner` وحده مهما أرسل
 * الجسم. ورفع الصلاحية عملية منفصلة لا تمرّ من هنا.
 *
 * الردّ يحمل كلمة المرور وسرّ المصادقة الثنائية مرّة واحدة ولا يُخزَّنان
 * بصورة تُستردّ — فإن ضاعا، أُعيد إنشاء الحساب.
 */
export async function POST(req) {
  const user = await S.currentUser();
  const denied = A.guardAdmin(user);
  if (denied) return denied;

  const b = await req.json().catch(() => ({}));
  const email = String(b.email || '').trim();
  const fullNameAr = String(b.fullNameAr || '').trim();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'بريد غير صالح' }, { status: 400 });
  }
  if (!fullNameAr) {
    return NextResponse.json({ ok: false, error: 'الاسم مطلوب' }, { status: 400 });
  }

  const dueDays = Number(b.dueDays);

  try {
    const out = await db.withTenant(user.tenant.id, user.id, (c) => provisionLearner(c, {
      email,
      fullNameAr,
      employeeNo: String(b.employeeNo || '').trim() || null,
      department: String(b.department || '').trim() || null,
      jobTitle: String(b.jobTitle || '').trim() || null,
      courseCode: String(b.courseCode || 'COP-101').trim(),
      cohort: String(b.cohort || '').trim() || 'Q1-2027',
      dueDays: Number.isFinite(dueDays) && dueDays > 0 && dueDays <= 365 ? dueDays : 21,
      via: `admin:${user.email}`,
    }));
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    // رسائل provisionLearner مكتوبة للقارئ العربي ولا تكشف حالة داخلية.
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
