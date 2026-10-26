'use strict';
// A learner to drive the end-to-end test with. Development only.
// ملف البيئة للتشغيل المحلّي فقط؛ على الخادم تأتي القيم من بيئة الحاوية،
// فغيابه ليس خطأ.
try {
  require('node:fs').readFileSync(__dirname + '/../.env.local', 'utf8')
    .split('\n').filter(Boolean).forEach((l) => {
      const i = l.indexOf('='); if (i > 0) process.env[l.slice(0, i)] = l.slice(i + 1);
    });
} catch (e) { if (e.code !== 'ENOENT') throw e; }
const db = require('../src/db');
const identity = require('../src/identity');
const totp = require('../src/totp');

const EMAIL = 'salem@alain.example';
const PASS = 'Munic1pality!Khuta';

(async () => {
  const t = await db.resolveTenant('alain.khuta.b14facilities.com');
  const out = await db.withTenant(t.id, null, async (c) => {
    await c.query('delete from app_user where lower(email)=lower($1)', [EMAIL]);
    const u = await identity.createUser(c, {
      email: EMAIL, fullNameAr: 'سالم محمد الكعبي', employeeNo: 'EMP-0001',
      department: 'الصحة العامة والبيئة', jobTitle: 'مهندس أول',
    });
    await identity.setPassword(c, u.id, PASS);
    await c.query(`insert into user_role_grant (tenant_id, user_id, role)
                   values (current_tenant(), $1, 'learner')`, [u.id]);

    const { rows: e } = await c.query(`
      insert into enrolment (tenant_id, user_id, course_id, cohort, state, due_at)
      select current_tenant(), $1, id, 'Q1-2027', 'in_progress', now() + interval '21 days'
        from course where code = 'COP-101' returning id`, [u.id]);

    // الحالة الصادقة للبداية: لا قياس قبلي مأخوذ. وأمّا الفتح فبحسب نمط
    // الدورة — مفتوحة كلّها في النمط المفتوح، ومقفلة في المُقيّد حتى يفتحها
    // القبلي ثم الاختبارات. وهذا هو منطق provision.js نفسه، فلا يفترقان.
    await c.query(`
      insert into lesson_progress (tenant_id, enrolment_id, lesson_id, unlocked_at)
      select current_tenant(), $1, l.id, case when co.mode = 'open' then now() end
        from lesson l join course co on co.id = l.course_id where co.code = 'COP-101'`, [e[0].id]);

    const m = await identity.beginMfaEnrolment(c, u.id, { account: EMAIL });
    await identity.confirmMfaEnrolment(c, u.id, totp.totp(m.secret));
    return { userId: u.id, secret: m.secret };
  });
  // The tests read the secret from this file. Writing it here, in the same run
  // that enrols the authenticator, is what keeps the two from drifting apart.
  require('node:fs').writeFileSync(__dirname + '/../.demo-secret', out.secret + '\n');
  console.log(JSON.stringify({ email: EMAIL, password: PASS, ...out }));
  await db.close();
})();
