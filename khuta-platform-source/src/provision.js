'use strict';
// إنشاء متعلّم وتسجيله في دورة، في مكان واحد.
//
// يستعمله طريقان: الواجهة الإدارية (app/api/admin/learners) وسطر الأوامر
// (scripts/add_learner.js). كُتب مرّة واحدة عمدًا — فخطوات الإنشاء ستّ، ولو
// تكرّرت في موضعين لانحرف أحدهما عن الآخر عند أوّل تعديل.
//
// لا يفتح معاملة ولا يضبط سياق الجهة: يتلقّى اتصالًا داخل withTenant، فيجري
// كلّه أو لا يجري شيء منه.
const crypto = require('node:crypto');
const identity = require('./identity');
const totp = require('./totp');
const db = require('./db');

const LOWER = 'abcdefghijkmnpqrstuvwxyz';   // بلا l و o، تُقرأ خطأً
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // بلا I و O
const DIGIT = '23456789';                   // بلا 0 و 1

/** كلمة مرور تستوفي passwordProblems، وتُملى صوتيًّا بلا لبس. */
function generatePassword() {
  const pick = (set, n) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join('');
  return `Kh${pick(LOWER, 6)}${pick(DIGIT, 4)}!${pick(UPPER, 3)}`;
}

/**
 * ينشئ المتعلّم ويمنحه الدور ويسجّله ويهيّئ تقدّمه ويُسجّل مصادقته الثنائية.
 *
 * المصادقة الثانية تُسجَّل هنا لا عند أوّل دخول، لأن المنصّة لا تملك بعد مسار
 * تسجيل ذاتي. فالسرّ يظهر لمن أنشأ الحساب مرّة واحدة ليسلّمه للمتعلّم. هذا
 * تنازل معروف، وبديله الصحيح تسجيل ذاتي عند أوّل دخول.
 */
async function provisionLearner(c, {
  email, fullNameAr, employeeNo = null, department = null, jobTitle = null,
  courseCode = 'COP-101', cohort = 'Q1-2027', dueDays = 21,
  password = null, reset = false, via = 'unknown',
}) {
  if (!email) throw new Error('البريد مطلوب');
  if (!fullNameAr) throw new Error('الاسم مطلوب');

  const pw = password || generatePassword();
  const problems = identity.passwordProblems(pw);
  if (problems.length) throw new Error(`كلمة المرور مرفوضة: ${problems.join('، ')}`);

  const { rows: existing } = await c.query(
    'select id from app_user where lower(email) = lower($1)', [email]);
  if (existing.length) {
    if (!reset) throw new Error(`البريد ${email} مستعمَل`);
    await c.query('delete from app_user where id = $1', [existing[0].id]);
  }

  const { rows: course } = await c.query(
    'select id, title_ar from course where code = $1', [courseCode]);
  if (!course.length) throw new Error(`لا توجد دورة بالرمز "${courseCode}"`);

  const u = await identity.createUser(c, {
    email, fullNameAr, employeeNo, department, jobTitle,
  });
  await identity.setPassword(c, u.id, pw);

  // دور المتعلّم وحده. لا يمنح هذا الطريق أي دور آخر مهما كان المنادي، فرفع
  // الصلاحية يبقى عملية منفصلة ومقصودة.
  await c.query(
    `insert into user_role_grant (tenant_id, user_id, role)
     values (current_tenant(), $1, 'learner')`, [u.id]);

  const { rows: e } = await c.query(
    `insert into enrolment (tenant_id, user_id, course_id, cohort, state, due_at)
     values (current_tenant(), $1, $2, $3, 'in_progress', now() + ($4 || ' days')::interval)
     returning id`, [u.id, course[0].id, cohort, String(dueDays)]);

  // الحالة الصادقة للبداية: لا شيء مفتوح ولا تقييم قبلي مأخوذ.
  await c.query(
    `insert into lesson_progress (tenant_id, enrolment_id, lesson_id)
     select current_tenant(), $1, l.id from lesson l where l.course_id = $2`,
    [e[0].id, course[0].id]);

  const m = await identity.beginMfaEnrolment(c, u.id, { account: email });
  await identity.confirmMfaEnrolment(c, u.id, totp.totp(m.secret));

  await db.audit(c, {
    action: 'learner.provisioned',
    objectType: 'app_user',
    objectId: u.id,
    detail: { email, course: courseCode, cohort, via },
  });

  return {
    userId: u.id,
    enrolmentId: e[0].id,
    courseTitle: course[0].title_ar,
    email,
    fullNameAr,
    password: pw,
    mfaSecret: m.secret,
    otpauth: m.uri,
  };
}

module.exports = { provisionLearner, generatePassword };
