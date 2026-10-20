'use strict';
// إضافة متعلّم وتسجيله في دورة، من سطر الأوامر.
//
// ريثما تُبنى الواجهة الإدارية، هذا هو الطريق الوحيد لإدخال متعلّم إلى المنصّة.
// يعمل من داخل صورة التطبيق بدور `khuta_app` نفسه الذي يعمل به الخادم — فلا
// يمنح هذا السكربت صلاحية لا يملكها التطبيق أصلًا.
//
//   EMAIL=a@b.example NAME='سالم الكعبي' PASSWORD='...' node scripts/add_learner.js
//
// المتغيّرات: EMAIL و NAME مطلوبان. PASSWORD يُولَّد إن غاب. COURSE يفترض
// COP-101، و TENANT يفترض alain، و COHORT و DUE_DAYS و EMP و DEPT و TITLE
// اختيارية. RESET=1 يحذف المستخدم القائم بالبريد نفسه ويعيد إنشاءه — لا
// يُستعمل إلا على بيانات تجريبية.
//
// يطبع JSON فيه كلمة المرور وسرّ المصادقة الثنائية. يُقرأ مرّة ثمّ يُتلف:
// السرّ لا يُستخرج من قاعدة البيانات بعد ذلك.
const crypto = require('node:crypto');
const db = require('../src/db');
const identity = require('../src/identity');
const totp = require('../src/totp');

const env = (k, d) => (process.env[k] && process.env[k].trim()) || d;

const EMAIL = env('EMAIL');
const NAME = env('NAME');
const COURSE = env('COURSE', 'COP-101');
const TENANT = env('TENANT', 'alain');
const COHORT = env('COHORT', 'Q1-2027');
const DUE_DAYS = Number(env('DUE_DAYS', '21'));
const RESET = env('RESET') === '1';

// كلمة مرور مولَّدة تستوفي شروط passwordProblems دون أن تحتاج تدخّلًا.
function generatePassword() {
  const pick = (s, n) => Array.from({ length: n },
    () => s[crypto.randomInt(s.length)]).join('');
  return `Kh${pick('abcdefghijkmnpqrstuvwxyz', 6)}${pick('23456789', 4)}!${pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 3)}`;
}
const PASSWORD = env('PASSWORD', generatePassword());

function fail(msg) {
  console.error(`خطأ: ${msg}`);
  process.exit(1);
}

(async () => {
  if (!EMAIL) fail('EMAIL مطلوب');
  if (!NAME) fail('NAME مطلوب');

  const problems = identity.passwordProblems(PASSWORD);
  if (problems && problems.length) fail(`كلمة المرور مرفوضة: ${problems.join('، ')}`);

  const t = await db.resolveTenant('', TENANT);
  if (!t) fail(`لا توجد جهة باسم "${TENANT}"`);

  const out = await db.withTenant(t.id, null, async (c) => {
    const { rows: existing } = await c.query(
      'select id from app_user where lower(email) = lower($1)', [EMAIL]);
    if (existing.length) {
      if (!RESET) {
        throw new Error(`المستخدم ${EMAIL} موجود. استعمل RESET=1 لإعادة إنشائه — على بيانات تجريبية فقط.`);
      }
      await c.query('delete from app_user where id = $1', [existing[0].id]);
    }

    const { rows: course } = await c.query(
      'select id, title_ar from course where code = $1', [COURSE]);
    if (!course.length) throw new Error(`لا توجد دورة بالرمز "${COURSE}"`);

    const u = await identity.createUser(c, {
      email: EMAIL,
      fullNameAr: NAME,
      employeeNo: env('EMP', null),
      department: env('DEPT', null),
      jobTitle: env('TITLE', null),
    });
    await identity.setPassword(c, u.id, PASSWORD);
    await c.query(
      `insert into user_role_grant (tenant_id, user_id, role)
       values (current_tenant(), $1, 'learner')`, [u.id]);

    const { rows: e } = await c.query(
      `insert into enrolment (tenant_id, user_id, course_id, cohort, state, due_at)
       values (current_tenant(), $1, $2, $3, 'in_progress', now() + ($4 || ' days')::interval)
       returning id`, [u.id, course[0].id, COHORT, String(DUE_DAYS)]);

    // الحالة الصادقة للبداية: لا شيء مفتوح ولا تقييم قبلي مأخوذ. ر١ يفتح الدرس
    // الأوّل، و ر٢ و ر٣ يفتحان ما بعده.
    await c.query(
      `insert into lesson_progress (tenant_id, enrolment_id, lesson_id)
       select current_tenant(), $1, l.id from lesson l where l.course_id = $2`,
      [e[0].id, course[0].id]);

    const m = await identity.beginMfaEnrolment(c, u.id, { account: EMAIL });
    await identity.confirmMfaEnrolment(c, u.id, totp.totp(m.secret));

    await db.audit(c, {
      action: 'learner.provisioned',
      objectType: 'app_user',
      objectId: u.id,
      detail: { email: EMAIL, course: COURSE, cohort: COHORT, via: 'scripts/add_learner.js' },
    });

    return {
      userId: u.id, enrolmentId: e[0].id, course: course[0].title_ar,
      secret: m.secret, otpauth: m.uri,
    };
  });

  console.log(JSON.stringify({
    email: EMAIL, name: NAME, password: PASSWORD,
    tenant: TENANT, course: COURSE, cohort: COHORT,
    userId: out.userId, enrolmentId: out.enrolmentId,
    mfaSecret: out.secret, otpauth: out.otpauth,
  }, null, 2));

  await db.close();
})().catch((e) => { console.error(`خطأ: ${e.message}`); process.exit(1); });
