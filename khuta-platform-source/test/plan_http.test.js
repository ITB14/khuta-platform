'use strict';
// الخطة التدريبية عبر HTTP — دورة كاملة من الإنشاء إلى الإغلاق.
// النطاق مُثبَت في plan.test.js على مستوى قاعدة البيانات؛ هنا المصادقة
// والتحقّق من الشكل وحالات الخطة.
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
const YEAR = 2032;

let pass = 0, fail = 0;
const ok = (c, label) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`); };
const section = (t) => console.log(`\n--- ${t} ---`);

function client() {
  let jar = '';
  return async function call(path, { method = 'GET', body } = {}) {
    const r = await fetch(BASE + path, {
      method, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const c of (r.headers.getSetCookie?.() || [])) {
      const [kv] = c.split(';'); const [k] = kv.split('=');
      jar = jar.split('; ').filter(Boolean).filter((p) => !p.startsWith(k + '=')).concat(kv).join('; ');
    }
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };
}

(async () => {
  const t = await db.resolveTenant('alain.khuta.b14facilities.com');
  const tag = Date.now();

  await db.withTenant(t.id, null, (c) => c.query(`
    insert into user_role_grant (tenant_id, user_id, role)
    select current_tenant(), id, 'admin' from app_user
     where tenant_id = current_tenant() and lower(email) = lower($1)
    on conflict (user_id, role) do nothing`, [EMAIL]));

  // إدارةٌ واحتياجٌ معتمد لتُبنى منه البنود
  const dept = await db.withTenant(t.id, null, async (c) => (await c.query(
    `insert into department (tenant_id, name_ar) values (current_tenant(), $1) returning id`,
    [`إدارة خطة HTTP ${tag}`])).rows[0].id);
  await db.withTenant(t.id, null, (c) => c.query(`
    insert into training_need (tenant_id, cycle_year, scope, department_id, title_ar,
                               headcount, source, status)
    values (current_tenant(), $1, 'department', $2, $3, 8, 'department', 'approved')`,
    [YEAR, dept, `موضوع خطة ${tag}`]));

  section('قبل تسجيل الدخول');
  const anon = client();
  ok((await anon('/api/academy/plan', { method: 'POST',
      body: { action: 'create', cycleYear: YEAR } })).status === 401,
     'إنشاء خطة بلا جلسة يُردّ بـ 401');
  ok((await anon('/api/academy/plan/selection', { method: 'POST',
      body: { planItemId: 'x', departmentId: 'y', seats: 1 } })).status === 401,
     'والاختيار كذلك');

  section('الأكاديمية');
  const call = client();
  await call('/api/auth/signin', { method: 'POST', body: { email: EMAIL, password: PASS } });
  await call('/api/auth/mfa', { method: 'POST', body: { code: totp.totp(SECRET) } });
  ok((await call(`/academy/plan?cycle=${YEAR}`)).status === 200, 'صفحة الخطة تُفتح');

  const created = await call('/api/academy/plan', { method: 'POST',
    body: { action: 'create', cycleYear: YEAR, titleAr: `خطة HTTP ${tag}` } });
  ok(created.status === 200 && created.json?.planId, 'تُنشأ الخطة');
  const planId = created.json?.planId;

  ok((await call('/api/academy/plan', { method: 'POST',
      body: { action: 'create', cycleYear: YEAR } })).status === 409,
     'ولا خطّتان لدورةٍ واحدة');

  ok((await call('/api/academy/plan', { method: 'POST',
      body: { action: 'ارفعها', planId } })).status === 400,
     'وإجراءٌ غير معروف يُردّ بـ 400');

  section('البنود');
  const built = await call('/api/academy/plan', { method: 'POST',
    body: { action: 'build', planId } });
  ok(built.status === 200 && built.json?.added >= 1, 'تُبنى البنود من الاحتياج المعتمد');

  const badSubject = await call('/api/academy/plan', { method: 'POST',
    body: { action: 'add-item', planId, titleAr: 'أ', courseId: 'x' } });
  ok(badSubject.status === 400, 'وبندٌ بموضوعين يُردّ بـ 400');

  const added = await call('/api/academy/plan', { method: 'POST',
    body: { action: 'add-item', planId, titleAr: `بند يدوي ${tag}`, targetSeats: 5 } });
  ok(added.status === 200 && added.json?.itemId, 'ويُضاف بندٌ يدويًّا');
  const itemId = added.json?.itemId;

  ok((await call('/api/academy/plan', { method: 'POST',
      body: { action: 'add-item', planId, titleAr: `بند يدوي ${tag}`, targetSeats: 2 } })).status === 409,
     'ولا يتكرّر موضوعه');

  section('الاختيار تابعٌ لحال الخطة');
  const early = await call('/api/academy/plan/selection', { method: 'POST',
    body: { planItemId: itemId, departmentId: dept, seats: 3 } });
  ok(early.status === 403, 'لا اختيار على مسوّدة');

  ok((await call('/api/academy/plan', { method: 'POST',
      body: { action: 'publish', planId } })).status === 200, 'تُنشر الخطة');
  ok((await call('/api/academy/plan', { method: 'POST',
      body: { action: 'publish', planId } })).status === 409, 'ولا تُنشر مرّتين');

  const sel = await call('/api/academy/plan/selection', { method: 'POST',
    body: { planItemId: itemId, departmentId: dept, seats: 3, priority: 'high' } });
  ok(sel.status === 200, 'ويُسجَّل الاختيار بعد النشر');

  const upd = await call('/api/academy/plan/selection', { method: 'POST',
    body: { planItemId: itemId, departmentId: dept, seats: 6 } });
  ok(upd.status === 200, 'وتعديله يُحدِّث المقاعد ولا يُنشئ صفًّا ثانيًا');

  const seats = await db.withTenant(t.id, null, async (c) => (await c.query(
    `select count(*)::int as n, max(seats) as s from plan_selection where plan_item_id = $1`,
    [itemId])).rows[0]);
  ok(seats.n === 1 && Number(seats.s) === 6, 'صفٌّ واحد بستّة مقاعد');

  ok((await call('/api/academy/plan/selection', { method: 'POST',
      body: { planItemId: itemId, departmentId: dept, seats: 0 } })).status === 400,
     'وصفرُ مقاعد يُردّ بـ 400');

  section('الإغلاق والحذف');
  ok((await call('/api/academy/plan', { method: 'POST',
      body: { action: 'close', planId } })).status === 200, 'تُغلق الخطة');
  ok((await call('/api/academy/plan/selection', { method: 'POST',
      body: { planItemId: itemId, departmentId: dept, seats: 2 } })).status === 403,
     'ولا التزام جديد بعدها');

  ok((await call('/api/academy/plan', { method: 'POST',
      body: { action: 'delete-item', itemId } })).status === 200,
     'والأكاديمية تحذف بندًا من خطة مغلقة — تصحيح السجلّ مشروع');
  const left = await db.withTenant(t.id, null, async (c) => (await c.query(
    `select count(*)::int as n from plan_item where id = $1`, [itemId])).rows[0].n);
  ok(left === 0, 'ويُحذف فعلًا');

  ok((await call('/api/academy/plan', { method: 'POST',
      body: { action: 'delete-item', itemId } })).status === 404,
     'وحذفُ ما لا وجود له يُردّ بـ 404');

  await db.withTenant(t.id, null, async (c) => {
    await c.query('delete from plan_item where plan_id = $1', [planId]);
    await c.query('delete from training_plan where id = $1', [planId]);
    await c.query('delete from training_need where cycle_year = $1', [YEAR]);
    await c.query('delete from department where id = $1', [dept]);
  });

  console.log(`\n${pass} PASS · ${fail} FAIL`);
  await db.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
