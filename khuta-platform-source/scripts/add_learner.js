'use strict';
// إضافة متعلّم وتسجيله في دورة، من سطر الأوامر.
//
// الواجهة الإدارية (/admin) تفعل الشيء نفسه بالفأرة. هذا الطريق باقٍ لأنّه
// الوحيد الذي يعمل قبل وجود أوّل مسؤول — ولأن إضافة دفعة كاملة من ملف أسرع
// من سطر الأوامر. كلاهما ينادي src/provision.js نفسه.
//
//   EMAIL=a@b.example NAME='سالم الكعبي' node scripts/add_learner.js
//
// المتغيّرات: EMAIL و NAME مطلوبان. PASSWORD يُولَّد إن غاب. COURSE يفترض
// COP-101، و TENANT يفترض alain، و COHORT و DUE_DAYS و EMP و DEPT و TITLE
// اختيارية. RESET=1 يحذف المستخدم القائم بالبريد نفسه ويعيد إنشاءه — لا
// يُستعمل إلا على بيانات تجريبية.
//
// يطبع JSON فيه كلمة المرور وسرّ المصادقة الثنائية. يُقرأ مرّة ثمّ يُتلف:
// السرّ لا يُستخرج من قاعدة البيانات بعد ذلك.
const db = require('../src/db');
const { provisionLearner } = require('../src/provision');

const env = (k, d) => (process.env[k] && process.env[k].trim()) || d;

(async () => {
  const EMAIL = env('EMAIL');
  const NAME = env('NAME');
  const TENANT = env('TENANT', 'alain');

  if (!EMAIL || !NAME) {
    console.error('خطأ: EMAIL و NAME مطلوبان');
    process.exit(1);
  }

  const t = await db.resolveTenant('', TENANT);
  if (!t) {
    console.error(`خطأ: لا توجد جهة باسم "${TENANT}"`);
    process.exit(1);
  }

  const out = await db.withTenant(t.id, null, (c) => provisionLearner(c, {
    email: EMAIL,
    fullNameAr: NAME,
    employeeNo: env('EMP', null),
    department: env('DEPT', null),
    jobTitle: env('TITLE', null),
    courseCode: env('COURSE', 'COP-101'),
    cohort: env('COHORT', 'Q1-2027'),
    dueDays: Number(env('DUE_DAYS', '21')),
    password: env('PASSWORD', null),
    reset: env('RESET') === '1',
    via: 'scripts/add_learner.js',
  }));

  console.log(JSON.stringify({ tenant: TENANT, ...out }, null, 2));
  await db.close();
})().catch((e) => { console.error(`خطأ: ${e.message}`); process.exit(1); });
