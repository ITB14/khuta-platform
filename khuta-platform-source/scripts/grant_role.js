'use strict';
// منح دور لمستخدم قائم، أو سحبه.
//
// وجوده سببٌ واحد: الواجهة الإدارية تتطلّب دور `admin`، ولا يملكه أحد عند
// أوّل نشر. فلا بدّ من طريق خارج الواجهة يصنع أوّل مسؤول — وبعده تُدار
// الأدوار من مكانها الطبيعي.
//
// رفع الصلاحية عملية مقصودة ومسجَّلة، ولذلك لا يفعلها مسار إنشاء المتعلّم.
//
//   EMAIL=a@b.example ROLE=admin node scripts/grant_role.js
//   EMAIL=a@b.example ROLE=admin REVOKE=1 node scripts/grant_role.js
//
// الأدوار: learner · supervisor · author · admin · auditor
const db = require('../src/db');

const ROLES = ['learner', 'supervisor', 'author', 'admin', 'auditor'];
const env = (k, d) => (process.env[k] && process.env[k].trim()) || d;

(async () => {
  const EMAIL = env('EMAIL');
  const ROLE = env('ROLE');
  const TENANT = env('TENANT', 'alain');
  const REVOKE = env('REVOKE') === '1';

  if (!EMAIL || !ROLE) {
    console.error('خطأ: EMAIL و ROLE مطلوبان');
    process.exit(1);
  }
  if (!ROLES.includes(ROLE)) {
    console.error(`خطأ: دور غير معروف "${ROLE}". المتاح: ${ROLES.join(' · ')}`);
    process.exit(1);
  }

  const t = await db.resolveTenant('', TENANT);
  if (!t) {
    console.error(`خطأ: لا توجد جهة باسم "${TENANT}"`);
    process.exit(1);
  }

  const out = await db.withTenant(t.id, null, async (c) => {
    const { rows: u } = await c.query(
      'select id, full_name_ar, email from app_user where lower(email) = lower($1)', [EMAIL]);
    if (!u.length) throw new Error(`لا يوجد مستخدم بالبريد ${EMAIL}`);

    if (REVOKE) {
      const { rowCount } = await c.query(
        'delete from user_role_grant where user_id = $1 and role = $2', [u[0].id, ROLE]);
      await db.audit(c, { action: 'role.revoke', objectType: 'app_user', objectId: u[0].id,
                          detail: { email: EMAIL, role: ROLE, changed: rowCount > 0 } });
    } else {
      await c.query(
        `insert into user_role_grant (tenant_id, user_id, role)
         values (current_tenant(), $1, $2) on conflict (user_id, role) do nothing`,
        [u[0].id, ROLE]);
      await db.audit(c, { action: 'role.grant', objectType: 'app_user', objectId: u[0].id,
                          detail: { email: EMAIL, role: ROLE } });
    }

    const { rows: now } = await c.query(
      'select role from user_role_grant where user_id = $1 order by role', [u[0].id]);
    return { user: u[0], roles: now.map((r) => r.role) };
  });

  console.log(JSON.stringify({
    email: out.user.email, name: out.user.full_name_ar,
    action: REVOKE ? 'revoke' : 'grant', role: ROLE, rolesNow: out.roles,
  }, null, 2));
  await db.close();
})().catch((e) => { console.error(`خطأ: ${e.message}`); process.exit(1); });
