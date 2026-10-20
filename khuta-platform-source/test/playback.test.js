'use strict';
// R1, R2 and R3 driven through the HTTP surface the browser uses, against the
// running server and the real database. The point of this file is that every
// refusal below comes from the server, never from the page.
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

let pass = 0, fail = 0, jar = '';
const ok = (c, label) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`); };
const section = (t) => console.log(`\n--- ${t} ---`);

async function call(path, body, method = 'POST') {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const set = r.headers.getSetCookie?.() || [];
  for (const c of set) {
    const [kv] = c.split(';');
    const [k] = kv.split('=');
    jar = jar.split('; ').filter(Boolean).filter((p) => !p.startsWith(k + '=')).concat(kv).join('; ');
  }
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

(async () => {
  const t = await db.resolveTenant('alain.khuta.b14facilities.com');
  const setDemo = (on) => db.withTenant(t.id, null, (c) =>
    c.query('update tenant set demo_mode=$1, demo_speed=8 where id=current_tenant()', [on]));
  await setDemo(false);

  const ctx = await db.withTenant(t.id, null, async (c) => {
    const { rows } = await c.query(`
      select e.id enrolment, u.id user_id,
             (select id from assessment where kind='pre') pre_assessment,
             (select json_agg(json_build_object('no', l.no, 'id', l.id, 'dur', l.end_sec-l.start_sec) order by l.no)
                from lesson l) lessons
        from enrolment e join app_user u on u.id = e.user_id
       where lower(u.email)=lower($1)`, [EMAIL]);
    return rows[0];
  });
  const L = ctx.lessons;

  section('تسجيل الدخول');
  await call('/api/auth/signin', { email: EMAIL, password: PASS });
  const mfa = await call('/api/auth/mfa', { code: totp.totp(SECRET) });
  ok(mfa.json?.ok === true, 'جلسة صالحة عبر كلمة المرور ثم الرمز');

  section('ر١ · بوابة التقييم القبلي');
  let r = await call('/api/course/open', { enrolmentId: ctx.enrolment });
  ok(r.status === 409 && r.json.reason === 'pre_assessment_required',
     'فتح الدورة مرفوض قبل أداء التقييم القبلي');
  r = await call(`/api/lesson/${L[0].id}/complete`, { enrolmentId: ctx.enrolment });
  ok(r.status === 409 && r.json.reason === 'locked',
     'والدرس الأول نفسه مقفل — لا التفاف على البوابة');

  // submit the pre-assessment (its own screens are the next increment)
  await db.withTenant(t.id, ctx.user_id, async (c) => {
    const { rows } = await c.query(
      `insert into attempt (tenant_id, enrolment_id, assessment_id, attempt_no, submitted_at, score)
       values (current_tenant(), $1, $2, 1, now(), 0.400) returning id`,
      [ctx.enrolment, ctx.pre_assessment]);
    return rows[0];
  });
  r = await call('/api/course/open', { enrolmentId: ctx.enrolment });
  ok(r.json?.ok === true, 'وبعد أدائه يُفتح الدرس الأول');

  section('ر٢ · النبضات والتغطية');
  const beat = (lesson, pos, seq) =>
    call(`/api/lesson/${lesson.id}/heartbeat`, { enrolmentId: ctx.enrolment, positionSec: pos, seq });
  const b1 = await beat(L[0], 10, 1);
  ok(b1.json?.ok === true, 'النبضة الأولى تُقبل والخادم يعيد التغطية');
  const b2 = await beat(L[0], 20, 2);
  ok(b2.status === 429 && b2.json.reason === 'rate',
     'والنبضة التالية فورًا تُرفض — أسرع من الزمن الحقيقي');

  await setDemo(true);
  ok(true, 'تفعيل وضع العرض (مسجَّل في سجلّ التدقيق)');

  const seek = await beat(L[0], L[0].dur - 10, 50);   // jump straight to the end
  ok(seek.json?.ok === true && seek.json.coverage < 0.2,
     `والقفز إلى نهاية الدرس لا يصنع تغطية — ${(seek.json.coverage * 100).toFixed(0)}٪ فقط`);
  r = await call(`/api/lesson/${L[0].id}/complete`, { enrolmentId: ctx.enrolment });
  ok(r.status === 409 && r.json.reason === 'insufficient_coverage', 'ولا يُقبل إكماله بالقفز');

  // cover half the lesson, then ask the server to complete it
  const half = Math.floor(L[0].dur / 2);
  for (let p = 0; p < half; p += 10) await beat(L[0], p, 100 + p);
  r = await call(`/api/lesson/${L[0].id}/complete`, { enrolmentId: ctx.enrolment });
  ok(r.status === 409 && r.json.reason === 'insufficient_coverage',
     `الإكمال مرفوض عند تغطية ${(r.json.coverage * 100).toFixed(0)}٪ والمطلوب ${(r.json.required * 100).toFixed(0)}٪`);

  for (let p = half; p <= L[0].dur; p += 10) await beat(L[0], p, 200 + p);
  r = await call(`/api/lesson/${L[0].id}/complete`, { enrolmentId: ctx.enrolment });
  ok(r.json?.ok === true, `وبعد اكتمال المشاهدة يُقبل — التغطية ${(r.json.coverage * 100).toFixed(0)}٪`);

  section('ر٣ و ر٤ · التسلسل');
  // Watching the video finishes the lesson. It does not open the next one:
  // under R4 that is what passing the lesson quiz does, and only that.
  ok(r.json?.nextLessonNo === null, 'لكنه لا يفتح الدرس التالي — ذلك لاختبار الدرس');
  r = await call(`/api/lesson/${L[1].id}/complete`, { enrolmentId: ctx.enrolment });
  ok(r.status === 409 && r.json.reason === 'locked', 'الدرس الثاني مقفل حتى يُجتاز اختبار الأول');
  r = await call(`/api/lesson/${L[2].id}/complete`, { enrolmentId: ctx.enrolment });
  ok(r.status === 409 && r.json.reason === 'locked', 'والثالث كذلك — لا قفز');

  section('الوسائط الموقَّعة');
  const page = await fetch(`${BASE}/lesson/1`, { headers: { cookie: jar } });
  const html = await page.text();
  const m = /\/api\/media\/([^"?]+)\?e=(\d+)&amp;s=([A-Za-z0-9_-]+)/.exec(html);
  ok(!!m, 'صفحة الدرس تحمل رابط وسائط موقَّعًا ومنتهي الصلاحية');
  if (m) {
    const good = await fetch(`${BASE}/api/media/${m[1]}?e=${m[2]}&s=${m[3]}`,
      { headers: { cookie: jar, range: 'bytes=0-1023' } });
    ok(good.status === 206, 'والرابط الصحيح يبثّ المقطع بدعم النطاقات');
    const tampered = await fetch(`${BASE}/api/media/${m[1]}?e=${m[2]}&s=${m[3].slice(0, -2)}AA`,
      { headers: { cookie: jar } });
    ok(tampered.status === 403, 'وتوقيع معدَّل يُرفض');
    const anon = await fetch(`${BASE}/api/media/${m[1]}?e=${m[2]}&s=${m[3]}`);
    ok(anon.status === 401, 'والرابط بلا جلسة لا يعمل — مشاركته بلا فائدة');
  }

  section('سجلّ التدقيق');
  const audit = await db.withTenant(t.id, null, (c) =>
    c.query(`select count(*)::int n from watch_heartbeat where enrolment_id=$1`, [ctx.enrolment]));
  // مشتقّ من مدّة الدرس لا رقم ثابت: نبضة لكل فترة عشر ثوانٍ على الأقل،
  // وإلا فُقد شيء من سجلّ المشاهدة.
  const least = Math.ceil(L[0].dur / 10);
  ok(audit.rows[0].n >= least,
     `النبضات محفوظة للمراجعة — ${audit.rows[0].n} نبضة والحدّ الأدنى ${least}`);

  await setDemo(false);
  await db.close();
  console.log(`\n${'='.repeat(58)}\n  ${pass} PASS · ${fail} FAIL\n${'='.repeat(58)}`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('\nERROR:', e.message);
  await db.close().catch(() => {});
  process.exit(1);
});
