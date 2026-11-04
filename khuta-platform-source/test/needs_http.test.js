'use strict';
// مسار الاحتياج عبر HTTP — الشاشة والمسار البرمجي، لا قاعدة البيانات وحدها.
// النطاق (أيّ إدارة وأيّ موظّف) مُثبَت في need.test.js على مستوى قاعدة
// البيانات؛ هنا يُثبَت ما تملكه الطبقة العليا: المصادقة، والتحقّق من الشكل،
// وأن الاعتماد لا يُقبل إلا ممّن يملكه.
const fs = require('node:fs');
fs.readFileSync(__dirname + '/../.env.local', 'utf8')
  .split('\n').filter(Boolean).forEach((l) => {
    const i = l.indexOf('='); if (i > 0) process.env[l.slice(0, i)] = l.slice(i + 1);
  });
const db = require('../src/db');
const totp = require('../src/totp');

const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const EMAIL = 'salem@alain.example';
const PASS = 'Munic1pality!Khuta';
const SECRET = fs.readFileSync(__dirname + '/../.demo-secret', 'utf8').trim();
const YEAR = 2029;

let pass = 0, fail = 0;
const ok = (c, label) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`); };
const section = (t) => console.log(`\n--- ${t} ---`);

function client() {
  let jar = '';
  return async function call(path, { method = 'GET', body } = {}) {
    const r = await fetch(BASE + path, {
      method,
      headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    for (const c of (r.headers.getSetCookie?.() || [])) {
      const [kv] = c.split(';'); const [k] = kv.split('=');
      jar = jar.split('; ').filter(Boolean).filter((p) => !p.startsWith(k + '=')).concat(kv).join('; ');
    }
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, location: r.headers.get('location'), json, text };
  };
}

(async () => {
  const t = await db.resolveTenant('alain.khuta.b14facilities.com');
  const tag = Date.now();

  // المستخدم التجريبي متعلّم بالبذرة. كل مجموعة فحص تمنح ما تحتاجه بنفسها،
  // فلا تعتمد على ترتيب تشغيلها — وهذا العيب الذي أُصلح هنا لا يُكرَّر.
  await db.withTenant(t.id, null, (c) => c.query(`
    insert into user_role_grant (tenant_id, user_id, role)
    select current_tenant(), id, 'admin' from app_user
     where tenant_id = current_tenant() and lower(email) = lower($1)
    on conflict (user_id, role) do nothing`, [EMAIL]));

  section('قبل تسجيل الدخول');
  const anon = client();
  const a1 = await anon('/api/academy/needs', { method: 'POST',
    body: { cycleYear: YEAR, scope: 'department', titleAr: 'x' } });
  ok(a1.status === 401, 'رفع احتياج بلا جلسة يُردّ بـ 401');
  const a2 = await anon('/academy/needs');
  ok(a2.status === 307 || a2.status === 302, 'والصفحة تُحوّل إلى تسجيل الدخول');

  section('الأكاديمية');
  const call = client();
  await call('/api/auth/signin', { method: 'POST', body: { email: EMAIL, password: PASS } });
  const mfa = await call('/api/auth/mfa', { method: 'POST', body: { code: totp.totp(SECRET) } });
  ok(mfa.status === 200, 'تسجيل الدخول بعاملين');

  const page = await call('/academy/needs');
  ok(page.status === 200, 'وصفحة الاحتياج تُفتح');
  ok(page.text.includes('الاحتياج التدريبي'), 'وتحمل عنوانها');

  // إدارة للاختبار
  const dept = await db.withTenant(t.id, null, async (c) => (await c.query(
    `insert into department (tenant_id, name_ar) values (current_tenant(), $1) returning id`,
    [`إدارة HTTP ${tag}`])).rows[0].id);

  section('التحقّق من الشكل');
  const noSubject = await call('/api/academy/needs', { method: 'POST',
    body: { cycleYear: YEAR, scope: 'department', departmentId: dept } });
  ok(noSubject.status === 400, 'احتياج بلا موضوع يُردّ بـ 400');

  const twoSubjects = await call('/api/academy/needs', { method: 'POST',
    body: { cycleYear: YEAR, scope: 'department', departmentId: dept,
            titleAr: 'أ', courseId: '00000000-0000-0000-0000-000000000001' } });
  ok(twoSubjects.status === 400, 'وبموضوعين يُردّ بـ 400');

  const badYear = await call('/api/academy/needs', { method: 'POST',
    body: { cycleYear: 1999, scope: 'department', departmentId: dept, titleAr: 'أ' } });
  ok(badYear.status === 400, 'وبسنة خارج المدى يُردّ بـ 400');

  const badScope = await call('/api/academy/needs', { method: 'POST',
    body: { cycleYear: YEAR, scope: 'الجهة كلّها', titleAr: 'أ' } });
  ok(badScope.status === 400, 'وبنطاق غير معروف يُردّ بـ 400');

  section('الدورة الكاملة');
  const made = await call('/api/academy/needs', { method: 'POST',
    body: { cycleYear: YEAR, scope: 'department', departmentId: dept,
            titleAr: `موضوع HTTP ${tag}`, headcount: 9, priority: 'high',
            justification: 'لازم للعمل' } });
  ok(made.status === 200 && made.json?.id, 'رفع احتياج مسوّدة');
  const id = made.json?.id;

  const early = await call('/api/academy/needs', { method: 'PATCH',
    body: { id, action: 'approve' } });
  ok(early.status === 409, 'ولا يُعتمد ما لم يُرفع للمراجعة بعد');

  const sub = await call('/api/academy/needs', { method: 'PATCH', body: { id, action: 'submit' } });
  ok(sub.status === 200 && sub.json?.need?.status === 'submitted', 'ثم يُرفع للمراجعة');

  const app = await call('/api/academy/needs', { method: 'PATCH',
    body: { id, action: 'approve', note: 'ضمن الخطة' } });
  ok(app.status === 200 && app.json?.need?.status === 'approved', 'ثم يُعتمد');

  const again = await call('/api/academy/needs', { method: 'PATCH', body: { id, action: 'approve' } });
  ok(again.status === 409, 'ولا يُعتمد مرّتين');

  const ghost = await call('/api/academy/needs', { method: 'PATCH',
    body: { id: '00000000-0000-0000-0000-000000000009', action: 'approve' } });
  ok(ghost.status === 404, 'واحتياجٌ لا وجود له يُردّ بـ 404 لا بتعديل صامت');

  section('أثره في التجميع');
  const after = await call(`/academy/needs?cycle=${YEAR}`);
  ok(after.text.includes(`موضوع HTTP ${tag}`), 'الاحتياج يظهر في الصفحة');
  ok(after.text.includes('>9<'), 'وعدد الموظفين التسعة يظهر في التجميع');

  const audited = await db.withTenant(t.id, null, async (c) => (await c.query(
    `select count(*)::int as n from audit_log
      where object_id = $1 and action in ('need.raise','need.submit','need.approve')`, [id]
  )).rows[0].n);
  ok(audited === 3, 'وثلاثة قيود في سجلّ التدقيق: رفعٌ ومراجعةٌ واعتماد');

  await db.withTenant(t.id, null, async (c) => {
    await c.query('delete from training_need where cycle_year = $1', [YEAR]);
    await c.query('delete from department where id = $1', [dept]);
  });

  console.log(`\n${pass} PASS · ${fail} FAIL`);
  await db.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
