'use strict';
// التصريح للمسارات الإدارية.
//
// العزل بين الجهات تفرضه قاعدة البيانات، أمّا الفصل بين متعلّم ومسؤول **داخل**
// الجهة فتفرضه طبقة التطبيق وحدها — ولذلك يلزم إثباته لا افتراضه. كل رفض
// أدناه يأتي من الخادم، لا من إخفاء زرّ في الصفحة.
const fs = require('node:fs');
require('node:fs').readFileSync(__dirname + '/../.env.local', 'utf8')
  .split('\n').filter(Boolean).forEach((l) => {
    const i = l.indexOf('='); if (i > 0) process.env[l.slice(0, i)] = l.slice(i + 1);
  });
const db = require('../src/db');
const totp = require('../src/totp');

const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const EMAIL = 'salem@alain.example';
const PASS = 'Munic1pality!Khuta';
const SECRET = fs.readFileSync(__dirname + '/../.demo-secret', 'utf8').trim();
const NEW_EMAIL = `admintest+${Date.now()}@alain.example`;

let pass = 0, fail = 0;
const ok = (c, label) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`); };
const section = (t) => console.log(`\n--- ${t} ---`);

/** عميل بسلّة كعك خاصّة به، كي يتعايش مستخدمان في الاختبار نفسه. */
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
      const [kv] = c.split(';');
      const [k] = kv.split('=');
      jar = jar.split('; ').filter(Boolean).filter((p) => !p.startsWith(k + '=')).concat(kv).join('; ');
    }
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, location: r.headers.get('location'), json, text };
  };
}

async function signIn(call, email, password, secret) {
  await call('/api/auth/signin', { method: 'POST', body: { email, password } });
  return call('/api/auth/mfa', { method: 'POST', body: { code: totp.totp(secret) } });
}

(async () => {
  const t = await db.resolveTenant('alain.khuta.b14facilities.com');
  const roles = (email) => db.withTenant(t.id, null, async (c) => {
    const { rows } = await c.query(
      `select g.role from user_role_grant g join app_user u on u.id = g.user_id
        where lower(u.email) = lower($1) order by g.role`, [email]);
    return rows.map((r) => r.role);
  });
  const setAdmin = (on) => db.withTenant(t.id, null, async (c) => {
    const { rows } = await c.query('select id from app_user where lower(email)=lower($1)', [EMAIL]);
    if (on) {
      await c.query(`insert into user_role_grant (tenant_id, user_id, role)
                     values (current_tenant(), $1, 'admin') on conflict do nothing`, [rows[0].id]);
    } else {
      await c.query(`delete from user_role_grant where user_id=$1 and role='admin'`, [rows[0].id]);
    }
  });

  await setAdmin(false);

  // ---------------------------------------------------------------- learner
  section('متعلّم لا يملك الإدارة');
  const learner = client();
  const m = await signIn(learner, EMAIL, PASS, SECRET);
  ok(m.status === 200 && m.json?.ok, 'المتعلّم دخل');

  const page = await learner('/admin');
  ok(page.status === 307 || page.status === 302, 'صفحة الإدارة لا تُعرض له');
  ok((page.location || '').includes('/dashboard'), 'ويُحوَّل إلى لوحته هو');

  const forbidden = await learner('/api/admin/learners', {
    method: 'POST', body: { email: 'x@y.example', fullNameAr: 'س' },
  });
  ok(forbidden.status === 403, 'ومسار الإنشاء يردّ 403 ولو ناداه مباشرةً');
  ok(forbidden.json?.error === 'forbidden', 'والردّ لا يذكر أدوارًا ولا أسبابًا');

  // --------------------------------------------------------------- outsider
  section('بلا جلسة أصلًا');
  const stranger = client();
  const anon = await stranger('/api/admin/learners', {
    method: 'POST', body: { email: 'x@y.example', fullNameAr: 'س' },
  });
  ok(anon.status === 401, 'الغريب يردّ عليه بـ401 لا 403');

  // ------------------------------------------------------------------ admin
  section('مسؤول');
  await setAdmin(true);
  const admin = client();
  await signIn(admin, EMAIL, PASS, SECRET);

  const roster = await admin('/admin');
  ok(roster.status === 200, 'صفحة الإدارة تُعرض له');
  ok(roster.text.includes('سالم محمد الكعبي'), 'والقائمة تحمل المتعلّمين فعلًا');

  section('إنشاء متعلّم من الواجهة');
  const made = await admin('/api/admin/learners', {
    method: 'POST',
    body: {
      email: NEW_EMAIL, fullNameAr: 'نورة أحمد البلوشي',
      department: 'الموارد البشرية', cohort: 'TEST',
      // محاولة رفع صلاحية مدسوسة في الجسم:
      role: 'admin', roles: ['admin'],
    },
  });
  ok(made.status === 200 && made.json?.ok, 'أُنشئ الحساب');
  ok(typeof made.json?.password === 'string' && made.json.password.length >= 12,
     'وعاد بكلمة مرور تستوفي الشرط');
  ok(typeof made.json?.mfaSecret === 'string' && made.json.mfaSecret.length >= 16,
     'وبسرّ مصادقة ثنائية');

  const granted = await roles(NEW_EMAIL);
  ok(granted.length === 1 && granted[0] === 'learner',
     'ودوره learner وحده — الجسم لا يمنح صلاحية');

  section('المتعلّم الجديد يدخل فعلًا');
  const fresh = client();
  const in2 = await signIn(fresh, NEW_EMAIL, made.json.password, made.json.mfaSecret);
  ok(in2.status === 200 && in2.json?.ok, 'بكلمة المرور والرمز اللذين عادا');
  const his = await fresh('/admin');
  ok(his.status === 307 || his.status === 302, 'ولا يرى الإدارة هو الآخر');

  section('الكلمة المؤقّتة تُجبره على تغييرها');
  const gate = await fresh('/dashboard');
  ok((gate.location || '').includes('/account/password'),
     'لوحته تُحوّله إلى صفحة تغيير كلمة المرور');
  const lesson = await fresh('/lesson/1');
  ok((lesson.location || '').includes('/account/password'),
     'والدخول المباشر على درس يُحوَّل كذلك — لا التفاف بالرابط');

  const wrongCurrent = await fresh('/api/account/password', {
    method: 'POST', body: { currentPassword: 'Nope!NotThePass1', newPassword: 'Jadeedah!2027xyz' },
  });
  ok(wrongCurrent.status === 401, 'والتغيير يُرفض بكلمة حالية خاطئة');

  const weak = await fresh('/api/account/password', {
    method: 'POST', body: { currentPassword: made.json.password, newPassword: 'short' },
  });
  ok(weak.status === 400, 'وكلمة جديدة ضعيفة تُرفض');

  const same = await fresh('/api/account/password', {
    method: 'POST', body: { currentPassword: made.json.password, newPassword: made.json.password },
  });
  ok(same.status === 400, 'وإعادة الكلمة نفسها تُرفض');

  const CHOSEN = 'Ikhtiyari!2027ab';
  const changed = await fresh('/api/account/password', {
    method: 'POST', body: { currentPassword: made.json.password, newPassword: CHOSEN },
  });
  ok(changed.status === 200 && changed.json?.ok, 'وبكلمة صالحة يتمّ التغيير');
  const after = await fresh('/dashboard');
  ok(after.status === 200, 'ولوحته تُفتح له بعدها');

  section('إعادة التعيين من الإدارة');
  const stale = client();
  await signIn(stale, NEW_EMAIL, CHOSEN, made.json.mfaSecret);
  ok((await stale('/dashboard')).status === 200, 'جلسة قائمة للمتعلّم قبل إعادة التعيين');

  const reset = await admin(`/api/admin/learners/${made.json.userId}/reset`, {
    method: 'POST', body: { password: true },
  });
  ok(reset.status === 200 && reset.json?.password, 'المسؤول أعاد التعيين وعادت كلمة جديدة');
  ok(reset.json.password !== CHOSEN, 'وهي غير التي اختارها');

  const killed = await stale('/dashboard');
  ok((killed.location || '').includes('/signin'), 'وجلسته القائمة أُبطلت فورًا');

  const back = client();
  const in3 = await signIn(back, NEW_EMAIL, reset.json.password, made.json.mfaSecret);
  ok(in3.status === 200 && in3.json?.ok, 'ويدخل بالكلمة الجديدة');
  ok(((await back('/dashboard')).location || '').includes('/account/password'),
     'ويُطلب منه تغييرها هو الآخر');

  section('الحساب الإداري لا يُعاد تعيينه من القائمة');
  const adminId = await db.withTenant(t.id, null, async (c) => {
    const { rows } = await c.query('select id from app_user where lower(email)=lower($1)', [EMAIL]);
    return rows[0].id;
  });
  const refused = await admin(`/api/admin/learners/${adminId}/reset`, {
    method: 'POST', body: { password: true },
  });
  ok(refused.status === 403, 'يُردّ بـ403 — رفع الصلاحية وانتزاعها لا يمرّان من هنا');

  section('التكرار مرفوض');
  const dup = await admin('/api/admin/learners', {
    method: 'POST', body: { email: NEW_EMAIL, fullNameAr: 'مكرّر' },
  });
  ok(dup.status === 400 && /مستعمَل/.test(dup.json?.error || ''), 'بريد مستعمَل يُرفض بوضوح');

  const bad = await admin('/api/admin/learners', {
    method: 'POST', body: { email: 'ليس بريدًا', fullNameAr: 'س' },
  });
  ok(bad.status === 400, 'وبريد غير صالح يُرفض');

  // ---------------------------------------------------------------- cleanup
  await db.withTenant(t.id, null, (c) =>
    c.query('delete from app_user where lower(email) = lower($1)', [NEW_EMAIL]));
  await setAdmin(false);

  console.log(`\n==========================================================`);
  console.log(`  ${pass} PASS · ${fail} FAIL`);
  console.log(`==========================================================`);
  await db.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
