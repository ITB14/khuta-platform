'use strict';
// دورة التعلّم كاملة في النمط المفتوح، مُدارة من السطح الذي يستعمله المتصفّح:
// قياس قبلي اختياري، ثم مشاهدة بلا أقفال، ثم اختبار الشهادة الذي يُصحَّح
// سؤالًا سؤالًا ويكشف الصواب عند الخطأ، ثم الشهادة والتحقّق والإلغاء.
//
// مفتاح الإجابات يُقرأ هنا على اتصال منفصل بصفة مالك المخطّط، لأن دور التطبيق
// لا يستطيع قراءته أصلًا — وهذه هي ر٥، واضطرار هذا الملفّ إلى الالتفاف على
// التطبيق كي «يغشّ» هو الدليل عليها.
const fs = require('node:fs');
fs.readFileSync(__dirname + '/../.env.local', 'utf8').split('\n').filter(Boolean)
  .forEach((l) => { const i = l.indexOf('='); if (i > 0) process.env[l.slice(0, i)] = l.slice(i + 1); });
const { Pool } = require('pg');
const db = require('../src/db');
const totp = require('../src/totp');
const provision = require('../src/provision');

const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const EMAIL = 'salem@alain.example';
const PASS = 'Munic1pality!Khuta';
const SECRET = fs.readFileSync(__dirname + '/../.demo-secret', 'utf8').trim();
const SKIPPER = 'tariq.skips@alain.example';

let pass = 0, fail = 0, jar = '';
const ok = (c, label) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`); };
const section = (t) => console.log(`\n--- ${t} ---`);
const pc = (n) => `${Math.round(Number(n) * 100)}٪`;

// مالك المخطّط. لا يُستعمل إلا لقراءة المفتاح وللإلغاء.
const admin = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT),
  user: 'khuta', database: process.env.PGDATABASE, max: 2 });

const keysFor = async (ids) => (await admin.query(
  `select question_id, id, is_correct from question_option where question_id = any($1::uuid[])`,
  [ids])).rows;

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

(async () => {
  const t = await db.resolveTenant('alain.khuta.b14facilities.com');
  const setDemo = (on) => db.withTenant(t.id, null, (c) =>
    c.query('update tenant set demo_mode=$1, demo_speed=8 where id=current_tenant()', [on]));

  const ctx = await db.withTenant(t.id, null, async (c) => {
    const { rows } = await c.query(`
      select e.id enrolment,
             (select id from assessment where kind='post') post_assessment,
             (select json_agg(json_build_object('no', l.no, 'id', l.id, 'dur', l.end_sec-l.start_sec)
                       order by l.no) from lesson l) lessons
        from enrolment e join app_user u on u.id = e.user_id
       where lower(u.email) = lower($1)`, [EMAIL]);
    return rows[0];
  });
  const L = ctx.lessons;

  await call('/api/auth/signin', { email: EMAIL, password: PASS });
  await call('/api/auth/mfa', { code: totp.totp(SECRET) });

  // ------------------------------------------------------------------------
  section('ما لم يعد مستعملًا');
  let r = await call('/api/assessment/start', { slug: 'lesson-1' });
  ok(r.status === 409 && r.json.reason === 'not_used_in_open_mode',
     'اختبارات الدروس مغلقة صراحةً في النمط المفتوح لا ضمنًا');

  r = await call('/api/assessment/start', { slug: 'post' });
  ok(r.status === 409 && r.json.reason === 'lessons_outstanding',
     'واختبار الشهادة مقفل قبل مشاهدة الدروس — المشاهدة هي الشرط الباقي');

  // ------------------------------------------------------------------------
  section('القياس القبلي · اختياري لا بوّابة');
  const pre = (await call('/api/assessment/start', { slug: 'pre' })).json;
  ok(pre.ok && pre.questions.length === 12, 'يفتح باثني عشر سؤالًا — سؤال لكل مهارة');
  ok(pre.questions.every((q) => q.options.every((o) => !('is_correct' in o))),
     'والورقة لا تحمل مفاتيح الإجابات — ر٥');

  // انحدار: فتح التقييم ثم مغادرة الصفحة لا يُحرق محاولة.
  const again = (await call('/api/assessment/start', { slug: 'pre' })).json;
  ok(again.ok === true && again.resumed === true && again.attemptId === pre.attemptId,
     'ومحاولة مفتوحة لم تُسلَّم تُستأنف بإجاباتها ولا تُحتسب محاولة جديدة');

  // أربعة صحيحة والباقي خطأ: نقطة بداية قابلة للقياس
  const preKeys = await keysFor(pre.questions.map((q) => q.id));
  for (const [i, q] of pre.questions.entries()) {
    const opts = preKeys.filter((o) => o.question_id === q.id);
    const want = i < 4;
    await call(`/api/attempt/${pre.attemptId}/respond`,
      { questionId: q.id, optionId: (opts.find((o) => o.is_correct === want) || opts[0]).id });
  }
  const preRes = (await call(`/api/attempt/${pre.attemptId}/submit`)).json;
  ok(preRes.ok && preRes.score === 0.333 && preRes.passed === null,
     `يُسلَّم بلا نجاح ولا رسوب — الدرجة ${pc(preRes.score)} مرجعٌ للمقارنة`);
  ok(preRes.nextLessonNo === null,
     'ولا يفتح شيئًا: الدروس كانت مفتوحة قبله — هذا هو الفرق عن النمط المُقيّد');

  r = await call('/api/assessment/start', { slug: 'pre' });
  ok(r.status === 409 && ['already_submitted', 'no_attempts_left'].includes(r.json.reason),
     'ولا يُعاد — قياس واحد');

  // ------------------------------------------------------------------------
  section('المشاهدة · ر٢ وحدها');
  await setDemo(true);
  const watch = async (lesson) => {
    for (let p = 0; p <= lesson.dur; p += 10) {
      await call(`/api/lesson/${lesson.id}/heartbeat`,
        { enrolmentId: ctx.enrolment, positionSec: p, seq: Date.now() % 100000 + p });
    }
    return call(`/api/lesson/${lesson.id}/complete`, { enrolmentId: ctx.enrolment });
  };
  for (const l of L) await watch(l);
  const allDone = await db.withTenant(t.id, null, (c) => c.query(
    `select count(*) filter (where completed_at is not null)::int done from lesson_progress
      where enrolment_id = $1`, [ctx.enrolment]));
  ok(allDone.rows[0].done === 8, 'الدروس الثمانية مكتملة بلا اختبار بينها');

  // ------------------------------------------------------------------------
  section('اختبار الشهادة · تصحيح فوري وكشف الصواب');
  const post = (await call('/api/assessment/start', { slug: 'post' })).json;
  ok(post.ok && post.questions.length === 12,
     'يفتح باثني عشر سؤالًا — السؤالان الزائدان متقاعدان خارج الورقة');
  ok(post.questions.every((q) => q.options.every((o) => !('is_correct' in o))),
     'والورقة لا تحمل المفتاح — ر٥ قائمة رغم أن الصواب سيُكشف لاحقًا');
  ok(post.questions.every((q) => q.explain === null && q.resolved === false),
     'ولا شرح قبل الإجابة — الشرح نفسه لا يُسلَّم مقدَّمًا');

  const postKeys = await keysFor(post.questions.map((q) => q.id));
  const optsOf = (q) => postKeys.filter((o) => o.question_id === q.id);
  const q0 = post.questions[0];
  const wrong0 = optsOf(q0).find((o) => !o.is_correct);
  const right0 = optsOf(q0).find((o) => o.is_correct);

  const miss = (await call(`/api/attempt/${post.attemptId}/answer`,
    { questionId: q0.id, optionId: wrong0.id })).json;
  ok(miss.ok === true && miss.correct === false, 'إجابة خاطئة تُقبل ولا تُنهي شيئًا');
  ok(miss.correctOptionId === right0.id, 'ويُكشف الخيار الصحيح — وهو ما طُلب');
  ok(typeof miss.explain === 'string' && miss.explain.length > 20,
     'ومعه شرح مكتوب لا رسالة عامّة');
  ok(miss.remaining === 12 && miss.allDone === false,
     'والسؤال يبقى مفتوحًا — المتبقّي اثنا عشر');

  const hit = (await call(`/api/attempt/${post.attemptId}/answer`,
    { questionId: q0.id, optionId: right0.id })).json;
  ok(hit.correct === true && hit.remaining === 11, 'وإصابته تُنقص المتبقّي إلى أحد عشر');

  const repeat = (await call(`/api/attempt/${post.attemptId}/answer`,
    { questionId: q0.id, optionId: wrong0.id })).json;
  ok(repeat.remaining === 11, 'وسؤال أُصيب لا يُعاد فيُفسد — المتبقّي كما هو');

  let last = null;
  for (const q of post.questions.slice(1)) {
    last = (await call(`/api/attempt/${post.attemptId}/answer`,
      { questionId: q.id, optionId: optsOf(q).find((o) => o.is_correct).id })).json;
  }
  ok(last.remaining === 0 && last.allDone === true, 'وبإتمام الباقي لا يبقى سؤال');

  const postRes = (await call(`/api/attempt/${post.attemptId}/submit`)).json;
  ok(postRes.passed === true && postRes.score === 1,
     `يُسلَّم مكتملًا — ${postRes.correct} من ${postRes.total}`);

  const ft = await db.withTenant(t.id, null, (c) => c.query(
    `select * from first_try_score where enrolment_id = $1`, [ctx.enrolment]));
  ok(ft.rows[0]?.first_correct_n === 11 && ft.rows[0]?.total_n === 12,
     `ومؤشّر المحاولة الأولى صادق رغم الإعادة — ${ft.rows[0]?.first_correct_n} من 12`);

  section('مكسب التعلّم لمن أدّى القياس');
  const gain = await db.withTenant(t.id, null, (c) => c.query(
    `select count(*)::int n, round(avg(pre_ratio)*100) pre, round(avg(post_ratio)*100) post
       from learning_gain where enrolment_id = $1`, [ctx.enrolment]));
  const g = gain.rows[0];
  ok(g.n > 0 && Number(g.post) > Number(g.pre),
     `المكسب محسوب على ${g.n} مهارات — من ${g.pre}٪ إلى ${g.post}٪`);

  // ------------------------------------------------------------------------
  section('ر٧ و ر٩ · الشهادة والتحقّق');
  ok(!!postRes.certificateSerial, `صدرت الشهادة برقم ${postRes.certificateSerial}`);
  const cert = await db.withTenant(t.id, null, (c) => c.query(
    `select verify_code from certificate where enrolment_id = $1`, [ctx.enrolment]));
  const code = cert.rows[0].verify_code;

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

  // ------------------------------------------------------------------------
  // جوهر التعديل: من تخطّى القياس القبلي ينال شهادته كاملة، ولا يُحرم منها
  // ولا يُلام عليها — يفقد المقارنة وحدها.
  section('من تخطّى القياس القبلي');
  await db.withTenant(t.id, null, (c) => c.query(
    `delete from app_user where lower(email) = lower($1)`, [SKIPPER]));
  const skipper = await db.withTenant(t.id, null, (c) => provision.provisionLearner(c, {
    email: SKIPPER, fullNameAr: 'طارق سالم الكعبي', department: 'الخدمات',
    cohort: 'TEST-OPEN', via: 'test' }));

  const cut = await db.withTenant(t.id, null, async (c) => {
    const { rows } = await c.query(
      `select id from enrolment where user_id = $1`, [skipper.userId]);
    const e = rows[0].id;
    // المشاهدة نفسها مُثبتة في مجموعة أخرى؛ ما يُختبر هنا البوّابة لا ر٢.
    await c.query(`update lesson_progress set completed_at = now(), unlocked_at = now()
                    where enrolment_id = $1`, [e]);
    const { rows: gate } = await c.query(
      `select ok, reason from assessment_gate($1, $2)`, [e, ctx.post_assessment]);
    return { e, gate: gate[0] };
  });
  ok(cut.gate.ok === true, `اختبار الشهادة مفتوح له بلا قياس قبلي — ${cut.gate.reason}`);

  const issued = await db.withTenant(t.id, skipper.userId, async (c) => {
    const { rows: st } = await c.query('select * from start_attempt($1, $2)',
      [cut.e, ctx.post_assessment]);
    const { rows: paper } = await c.query('select distinct question_id from attempt_paper($1)',
      [st[0].attempt_id]);
    const k = await keysFor(paper.map((p) => p.question_id));
    for (const p of paper) {
      await c.query('select * from answer_question($1, $2, $3)', [st[0].attempt_id,
        p.question_id, k.find((o) => o.question_id === p.question_id && o.is_correct).id]);
    }
    const { rows: sub } = await c.query('select * from submit_attempt($1)', [st[0].attempt_id]);
    const { rows: gn } = await c.query('select count(*)::int n from learning_gain where enrolment_id=$1',
      [cut.e]);
    return { sub: sub[0], gain: gn[0].n };
  });
  ok(!!issued.sub.certificate_serial, `وتصدر شهادته — ${issued.sub.certificate_serial}`);
  ok(issued.gain === 0, 'ولا مكسب تعلّم له — لا مرجع يُقارَن به، وهذا كل ما فقده');

  // ------------------------------------------------------------------------
  section('محاولات الالتفاف');
  r = await call(`/api/attempt/${post.attemptId}/answer`,
    { questionId: q0.id, optionId: right0.id });
  ok(r.status === 409 && r.json.reason === 'already_submitted',
     'لا تُجاب أسئلة بعد التسليم');
  r = await call(`/api/attempt/${post.attemptId}/submit`);
  ok(r.json?.already === true, 'ولا يُعاد التسليم فيُغيَّر التصحيح');
  r = await call(`/api/attempt/00000000-0000-0000-0000-000000000000/submit`);
  ok(r.status === 404, 'ومحاولة شخص آخر لا تُسلَّم من هنا');

  // خيار من سؤال آخر لا يُقبل بديلًا — وإلا لأمكن حصاد المفتاح سؤالًا بسؤال.
  const stray = await db.withTenant(t.id, null, (c) => c.query(
    `select * from answer_question($1, $2, $3)`,
    [post.attemptId, post.questions[1].id, right0.id]));
  ok(stray.rows[0].ok === false, 'وخيار من سؤال آخر مرفوض');

  await setDemo(false);
  await db.close(); await admin.end();
  console.log(`\n${'='.repeat(58)}\n  ${pass} PASS · ${fail} FAIL\n${'='.repeat(58)}`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('\nERROR:', e.message);
  await db.close().catch(() => {}); await admin.end().catch(() => {});
  process.exit(1);
});
