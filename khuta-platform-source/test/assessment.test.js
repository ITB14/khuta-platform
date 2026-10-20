'use strict';
// The whole learning cycle driven through the HTTP surface the browser uses:
// pre-assessment, video, lesson quiz, sequencing, post-assessment, learning
// gain, certificate, verification and revocation.
//
// The answer key is read on a separate connection as the schema owner, because
// the application role genuinely cannot read it — that is R5, and this file
// having to go around the application to cheat is the proof.
const fs = require('node:fs');
fs.readFileSync(__dirname + '/../.env.local', 'utf8').split('\n').filter(Boolean)
  .forEach((l) => { const i = l.indexOf('='); if (i > 0) process.env[l.slice(0, i)] = l.slice(i + 1); });
const { Pool } = require('pg');
const db = require('../src/db');
const totp = require('../src/totp');

const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const EMAIL = 'salem@alain.example';
const PASS = 'Munic1pality!Khuta';
const SECRET = fs.readFileSync(__dirname + '/../.demo-secret', 'utf8').trim();

let pass = 0, fail = 0, jar = '';
const ok = (c, label) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`); };
const section = (t) => console.log(`\n--- ${t} ---`);
const pc = (n) => `${Math.round(Number(n) * 100)}٪`;

// the schema owner, used only to read the answer key and to revoke
const admin = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT),
  user: 'khuta', database: process.env.PGDATABASE, max: 2 });

async function call(path, body, method = 'POST') {
  const r = await fetch(BASE + path, {
    method, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual',
  });
  for (const c of (r.headers.getSetCookie?.() || [])) {
    const [kv] = c.split(';'); const [k] = kv.split('=');
    jar = jar.split('; ').filter(Boolean).filter((p) => !p.startsWith(k + '=')).concat(kv).join('; ');
  }
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

// Answer a started paper. `right` picks the correct option; false picks a wrong
// one, which is how a failing attempt is produced on purpose.
async function answer(started, right) {
  const keys = await admin.query(
    `select question_id, id, is_correct from question_option
      where question_id = any($1::uuid[])`, [started.questions.map((q) => q.id)]);
  for (const q of started.questions) {
    const opts = keys.rows.filter((o) => o.question_id === q.id);
    const pick = opts.find((o) => o.is_correct === right) || opts[0];
    const r = await call(`/api/attempt/${started.attemptId}/respond`,
      { questionId: q.id, optionId: pick.id });
    if (!r.json?.ok) throw new Error(`respond failed: ${r.text}`);
  }
}

(async () => {
  const t = await db.resolveTenant('alain.khuta.b14facilities.com');
  const setDemo = (on) => db.withTenant(t.id, null, (c) =>
    c.query('update tenant set demo_mode=$1, demo_speed=8 where id=current_tenant()', [on]));

  const ctx = await db.withTenant(t.id, null, async (c) => {
    const { rows } = await c.query(`
      select e.id enrolment,
             (select json_agg(json_build_object('no', l.no, 'id', l.id, 'dur', l.end_sec-l.start_sec)
                       order by l.no) from lesson l) lessons
        from enrolment e join app_user u on u.id = e.user_id
       where lower(u.email) = lower($1)`, [EMAIL]);
    return rows[0];
  });
  const L = ctx.lessons;

  await call('/api/auth/signin', { email: EMAIL, password: PASS });
  await call('/api/auth/mfa', { code: totp.totp(SECRET) });

  // --------------------------------------------------------------- R1 -----
  section('ر١ · التقييم القبلي يسبق كل شيء');
  let r = await call('/api/assessment/start', { slug: 'lesson-1' });
  ok(r.status === 409 && r.json.reason === 'lesson_not_complete',
     'اختبار الدرس الأول مغلق قبل مشاهدة الدرس');
  r = await call('/api/assessment/start', { slug: 'post' });
  ok(r.status === 409 && r.json.reason === 'lessons_outstanding',
     'والتقييم البعدي مغلق والدروس لم تبدأ');

  const pre = (await call('/api/assessment/start', { slug: 'pre' })).json;
  ok(pre.ok && pre.questions.length === 12, 'التقييم القبلي يفتح باثني عشر سؤالًا — سؤال لكل كفاية');
  ok(pre.questions.every((q) => q.options.length >= 3 && q.options.every((o) => !('is_correct' in o))),
     'والورقة لا تحمل مفاتيح الإجابات — ر٥');

  // four right, the rest wrong: a measurable starting point for R8
  const keys = await admin.query(
    `select question_id, id, is_correct from question_option where question_id = any($1::uuid[])`,
    [pre.questions.map((q) => q.id)]);
  for (const [i, q] of pre.questions.entries()) {
    const opts = keys.rows.filter((o) => o.question_id === q.id);
    const want = i < 4;
    await call(`/api/attempt/${pre.attemptId}/respond`,
      { questionId: q.id, optionId: (opts.find((o) => o.is_correct === want) || opts[0]).id });
  }
  const preRes = (await call(`/api/attempt/${pre.attemptId}/submit`)).json;
  const expected = Math.round((4 / pre.questions.length) * 1000) / 1000;
  ok(preRes.ok && preRes.score === expected && preRes.passed === null,
     `يُسلَّم بلا نجاح ولا رسوب — الدرجة ${pc(preRes.score)} مرجعٌ للمقارنة`);
  ok(preRes.nextLessonNo === 1, 'وتسليمه هو ما يفتح الدرس الأول');

  r = await call('/api/assessment/start', { slug: 'pre' });
  ok(r.status === 409 && ['already_submitted', 'no_attempts_left'].includes(r.json.reason),
     'ولا يُعاد — محاولة واحدة فقط');

  // --------------------------------------------------------------- R2/R4 --
  section('ر٢ ثم ر٤ · الفيديو يفتح الاختبار والاختبار يفتح الدرس');
  await setDemo(true);
  const watch = async (lesson) => {
    for (let p = 0; p <= lesson.dur; p += 10) {
      await call(`/api/lesson/${lesson.id}/heartbeat`,
        { enrolmentId: ctx.enrolment, positionSec: p, seq: Date.now() % 100000 + p });
    }
    return call(`/api/lesson/${lesson.id}/complete`, { enrolmentId: ctx.enrolment });
  };
  const done1 = await watch(L[0]);
  ok(done1.json?.ok === true && done1.json.nextLessonNo === null,
     'إكمال المشاهدة يُنهي الدرس ولا يفتح التالي بنفسه');
  r = await call(`/api/lesson/${L[1].id}/complete`, { enrolmentId: ctx.enrolment });
  ok(r.status === 409 && r.json.reason === 'locked', 'والدرس الثاني ما زال مقفلًا');

  const q1bad = (await call('/api/assessment/start', { slug: 'lesson-1' })).json;
  ok(q1bad.ok, 'واختبار الدرس الأول فُتح الآن');
  await answer(q1bad, false);
  const bad = (await call(`/api/attempt/${q1bad.attemptId}/submit`)).json;
  ok(bad.passed === false && bad.score === 0, `الرسوب في الاختبار يُسجَّل — ${pc(bad.score)} من ${pc(bad.passMark)}`);
  ok(bad.nextLessonNo === null, 'ولا يفتح الدرس التالي');
  r = await call(`/api/lesson/${L[1].id}/complete`, { enrolmentId: ctx.enrolment });
  ok(r.status === 409 && r.json.reason === 'locked', 'الدرس الثاني ما زال مقفلًا بعد الرسوب');

  const q1 = (await call('/api/assessment/start', { slug: 'lesson-1' })).json;
  ok(q1.attemptNo === 2, 'وتُتاح محاولة ثانية — ر٦');
  await answer(q1, true);
  const good = (await call(`/api/attempt/${q1.attemptId}/submit`)).json;
  ok(good.passed === true && good.nextLessonNo === 2,
     `واجتيازه بـ${pc(good.score)} هو ما فتح الدرس الثاني — ر٤`);

  r = await call('/api/assessment/start', { slug: 'lesson-1' });
  ok(r.status === 409 && r.json.reason === 'already_passed',
     'ولا يُعاد اختبار اجتزته');

  // ----------------------------------------------------------- the rest ---
  section('بقية المسار');
  for (let i = 1; i < L.length; i++) {
    await watch(L[i]);
    const q = (await call('/api/assessment/start', { slug: `lesson-${L[i].no}` })).json;
    await answer(q, true);
    await call(`/api/attempt/${q.attemptId}/submit`);
  }
  const allDone = await db.withTenant(t.id, null, (c) => c.query(
    `select count(*) filter (where completed_at is not null)::int done from lesson_progress
      where enrolment_id = $1`, [ctx.enrolment]));
  ok(allDone.rows[0].done === 8, 'الدروس الثمانية مكتملة واختباراتها مجتازة');

  // ------------------------------------------------------------ R7/R8 -----
  section('ر٨ · التقييم البعدي ومكسب التعلّم');
  const post = (await call('/api/assessment/start', { slug: 'post' })).json;
  ok(post.ok && post.questions.length === 14, 'التقييم البعدي فُتح بأربعة عشر سؤالًا');
  await answer(post, true);
  const postRes = (await call(`/api/attempt/${post.attemptId}/submit`)).json;
  ok(postRes.passed === true && postRes.score === 1,
     `اجتيازه بـ${pc(postRes.score)} والمطلوب ${pc(postRes.passMark)}`);

  const gain = await db.withTenant(t.id, null, (c) => c.query(
    `select count(*)::int n, round(avg(pre_ratio)*100) pre, round(avg(post_ratio)*100) post
       from learning_gain where enrolment_id = $1`, [ctx.enrolment]));
  const g = gain.rows[0];
  ok(g.n > 0 && Number(g.post) > Number(g.pre),
     `المكسب محسوب على ${g.n} كفايات — من ${g.pre}٪ إلى ${g.post}٪`);

  // -------------------------------------------------------------- R7/R9 ---
  section('ر٧ و ر٩ · الشهادة والتحقّق');
  ok(!!postRes.certificateSerial, `صدرت الشهادة برقم ${postRes.certificateSerial}`);
  const cert = await db.withTenant(t.id, null, (c) => c.query(
    `select verify_code from certificate where enrolment_id = $1`, [ctx.enrolment]));
  const code = cert.rows[0].verify_code;

  // the verification page takes no session — that is the point of it
  let page = await (await fetch(`${BASE}/verify?code=${encodeURIComponent(code)}`)).text();
  ok(page.includes('الشهادة سارية') && page.includes(postRes.certificateSerial),
     'والتحقّق بالرمز يعمل بلا تسجيل دخول');
  page = await (await fetch(`${BASE}/verify?code=ZZZZ-0000`)).text();
  ok(page.includes('لا توجد شهادة بهذا الرمز'), 'ورمز غير موجود يُقال فيه ذلك صراحة');

  await admin.query(`update certificate set revoked_at = now(), revoked_reason = $2
                      where verify_code = $1`, [code, 'اختبار الإلغاء']);
  page = await (await fetch(`${BASE}/verify?code=${encodeURIComponent(code)}`)).text();
  ok(page.includes('مُلغاة') && page.includes('اختبار الإلغاء'),
     'والإلغاء يظهر للمتحقّق فورًا — ر٩');

  // ----------------------------------------------------------- tampering --
  section('محاولات الالتفاف');
  r = await call(`/api/attempt/${post.attemptId}/respond`,
    { questionId: post.questions[0].id, optionId: post.questions[0].options[0].id });
  ok(r.status === 409 && r.json.reason === 'already_submitted',
     'لا تُعدَّل إجابة بعد التسليم');
  r = await call(`/api/attempt/${post.attemptId}/submit`);
  ok(r.json?.already === true, 'ولا يُعاد التسليم فيُغيَّر التصحيح');
  r = await call(`/api/attempt/00000000-0000-0000-0000-000000000000/submit`);
  ok(r.status === 404, 'ومحاولة شخص آخر لا تُسلَّم من هنا');

  await setDemo(false);
  await db.close(); await admin.end();
  console.log(`\n${'='.repeat(58)}\n  ${pass} PASS · ${fail} FAIL\n${'='.repeat(58)}`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('\nERROR:', e.message);
  await db.close().catch(() => {}); await admin.end().catch(() => {});
  process.exit(1);
});
