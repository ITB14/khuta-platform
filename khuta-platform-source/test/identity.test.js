'use strict';
// Runs against the live database as khuta_app. No mocks: if row-level security
// or a privilege is wrong, these tests fail.
process.env.KHUTA_MFA_KEY = process.env.KHUTA_MFA_KEY
  || require('node:crypto').randomBytes(32).toString('base64');

const db = require('../src/db');
const id = require('../src/identity');
const totp = require('../src/totp');

let pass = 0, fail = 0;
const ok = (cond, label) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); };
const section = (t) => console.log(`\n--- ${t} ---`);

const PW = 'Munic1pality!Khuta';
const mail = `t${Date.now()}@alain.example`;

(async () => {
  section('تحديد الجهة من اسم المضيف');
  const alain = await db.resolveTenant('alain.khuta.b14facilities.com');
  ok(alain && alain.slug === 'alain', 'نطاق فرعي لجهة يُحلّ إلى الجهة الصحيحة');
  const single = await db.resolveTenant('khuta.b14facilities.com');
  ok(single && single.slug === 'alain', 'ومضيف واحد بلا نطاق فرعي يقع على الجهة الافتراضية');
  const bki = await db.resolveTenant('bki.khuta.b14facilities.com');
  ok(bki && bki.slug === 'bki', 'وجهة أخرى تُحلّ إلى نفسها');
  ok(!(await db.resolveTenant('nope.khuta.b14facilities.com', 'nope')), 'وجهة غير موجودة لا تُحلّ');

  const T = alain.id, TB = bki.id;
  let user;

  section('إنشاء المستخدم وكلمة المرور');
  await db.withTenant(T, null, async (c) => {
    user = await id.createUser(c, { email: mail, fullNameAr: 'سالم محمد الكعبي',
                                    department: 'الصحة العامة', employeeNo: 'EMP-9001' });
    ok(!!user.id && user.status === 'invited', 'المستخدم أُنشئ بحالة «مدعوّ»');
    ok(id.passwordProblems('short').length > 0, 'كلمة مرور ضعيفة تُرفض مع بيان السبب');
    ok(id.passwordProblems(PW).length === 0, 'وكلمة مرور قوية تُقبل');
    await id.setPassword(c, user.id, PW);
    const { rows } = await c.query('select status from app_user where id=$1', [user.id]);
    ok(rows[0].status === 'active', 'وتعيين كلمة المرور فعّل الحساب');
    const { rows: h } = await c.query('select password_hash from user_credential where user_id=$1', [user.id]);
    ok(h[0].password_hash.startsWith('$argon2id$'), 'والتخزين بخوارزمية argon2id لا بغيرها');
    ok(!h[0].password_hash.includes(PW), 'وكلمة المرور نفسها غير مخزّنة بأي صورة');
  });

  section('عزل الجهات على مستوى الصف');
  await db.withTenant(TB, null, async (c) => {
    const { rows } = await c.query('select count(*)::int n from app_user where lower(email)=lower($1)', [mail]);
    ok(rows[0].n === 0, 'جهة أخرى لا ترى المستخدم ولو بحثت عنه بعنوانه');
  });
  await db.withTenant(TB, null, async (c) => {
    const r = await id.authenticate(c, { email: mail, password: PW });
    ok(!r.ok, 'ولا تستطيع تسجيل الدخول بحسابه حتى بكلمة المرور الصحيحة');
  });

  section('المصادقة');
  await db.withTenant(T, null, async (c) => {
    const bad = await id.authenticate(c, { email: mail, password: 'WrongPassword123' });
    ok(!bad.ok && bad.reason === 'invalid_credentials', 'كلمة مرور خاطئة تُرفض');
    const ghost = await id.authenticate(c, { email: 'ghost@alain.example', password: PW });
    ok(!ghost.ok && ghost.reason === 'invalid_credentials',
       'وحساب غير موجود يعطي الردّ نفسه — لا يكشف من هو مسجَّل');
    const good = await id.authenticate(c, { email: mail, password: PW, ip: '10.0.0.5' });
    ok(good.ok && good.userId === user.id, 'وكلمة المرور الصحيحة تنجح');
    ok(good.mfaRequired === false, 'ولا تُطلب مصادقة ثانية قبل تفعيلها');
    const { rows } = await c.query(
      `select count(*) filter (where email_attempted = $1)::int mine,
              count(*) filter (where email_attempted = 'ghost@alain.example')::int ghost,
              count(*) filter (where email_attempted = $1 and success)::int good
         from login_attempt`, [mail]);
    ok(rows[0].mine === 2 && rows[0].good === 1,
       'ومحاولتا هذا الحساب سُجّلتا — الفاشلة والناجحة');
    ok(rows[0].ghost >= 1,
       'ومحاولة الحساب غير الموجود سُجّلت تحت العنوان المُدخَل، لا تحت حساب قائم');
  });

  section('الإقفال بعد المحاولات الفاشلة');
  await db.withTenant(T, null, async (c) => {
    let last;
    for (let i = 0; i < 5; i++) last = await id.authenticate(c, { email: mail, password: 'Nope12345678' });
    ok(last.locked === true, 'خمس محاولات فاشلة تُقفل الحساب');
    const blocked = await id.authenticate(c, { email: mail, password: PW });
    ok(!blocked.ok && blocked.reason === 'locked',
       'والحساب المقفل يُرفض حتى بكلمة المرور الصحيحة');
    await c.query('update user_lockout set locked_until=null, failed_count=0 where user_id=$1', [user.id]);
    const after = await id.authenticate(c, { email: mail, password: PW });
    ok(after.ok, 'وبعد انتهاء المدّة يعود الدخول');
  });

  section('المصادقة الثنائية');
  let secret;
  await db.withTenant(T, user.id, async (c) => {
    const e = await id.beginMfaEnrolment(c, user.id, { account: mail });
    secret = e.secret;
    ok(e.uri.startsWith('otpauth://totp/Khuta%3A'), 'رابط التهيئة صالح لتطبيق المصادقة');
    const { rows } = await c.query('select totp_secret_enc, confirmed_at from user_mfa where user_id=$1', [user.id]);
    ok(!rows[0].totp_secret_enc.toString('utf8').includes(secret),
       'والسرّ مشفَّر في قاعدة البيانات لا مخزَّن نصًّا صريحًا');
    ok(rows[0].confirmed_at === null, 'ولا يُعدّ مفعّلًا قبل التأكيد');
    ok((await id.confirmMfaEnrolment(c, user.id, '000000')).ok === false, 'ورمز خاطئ لا يؤكّده');
    ok((await id.confirmMfaEnrolment(c, user.id, totp.totp(secret))).ok === true, 'والرمز الصحيح يؤكّده');
  });
  await db.withTenant(T, null, async (c) => {
    const r = await id.authenticate(c, { email: mail, password: PW });
    ok(r.ok && r.mfaRequired === true, 'وبعد التفعيل لا يكتمل الدخول بكلمة المرور وحدها');
    ok((await id.verifyMfa(c, user.id, totp.totp(secret))) === true, 'والرمز الصحيح يُقبل');
    ok((await id.verifyMfa(c, user.id, '123456')) === false, 'والخاطئ يُرفض');
  });

  section('الجلسات');
  await db.withTenant(T, user.id, async (c) => {
    const s = await id.createSession(c, user.id, { ip: '10.0.0.5', userAgent: 'test' });
    ok(s.token.length >= 40, 'الرمز عشوائي طويل');
    const { rows } = await c.query('select token_hash from user_session where id=$1', [s.sessionId]);
    ok(!rows[0].token_hash.toString('utf8').includes(s.token),
       'والمخزَّن بصمة الرمز لا الرمز — تسريب القاعدة لا يعطي جلسة صالحة');
    const v = await id.validateSession(c, s.token);
    ok(v && v.user.id === user.id, 'والرمز الصحيح يفتح الجلسة');
    ok((await id.validateSession(c, 'not-a-real-token')) === null, 'ورمز مزوَّر لا يفتحها');
    ok((await id.revokeSession(c, s.token)) === true, 'والخروج يُبطل الجلسة');
    ok((await id.validateSession(c, s.token)) === null, 'والرمز الملغى لا يعمل بعدها');
    await c.query(`update user_session set expires_at = now() - interval '1 hour' where user_id=$1`, [user.id]);
    const s2 = await id.createSession(c, user.id, { hours: -1 });
    ok((await id.validateSession(c, s2.token)) === null, 'والجلسة منتهية الصلاحية مرفوضة');
  });

  section('سجلّ التدقيق');
  await db.withTenant(T, null, async (c) => {
    const { rows } = await c.query(
      `select action, count(*)::int n from audit_log group by action order by action`);
    const actions = rows.map(r => r.action);
    ok(actions.includes('user.create') && actions.includes('user.password_set'),
       'إنشاء المستخدم وتعيين كلمة المرور مسجَّلان');
    ok(actions.includes('user.locked'), 'والإقفال مسجَّل');
    ok(actions.includes('mfa.enrol_confirm'), 'وتفعيل المصادقة الثنائية مسجَّل');
    ok(actions.includes('session.create') && actions.includes('session.revoke'),
       'وفتح الجلسة وإغلاقها مسجَّلان');
  });

  console.log(`\n${'='.repeat(58)}\n  ${pass} PASS · ${fail} FAIL\n${'='.repeat(58)}`);
  await db.close();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('\nERROR:', e.message);
  await db.close().catch(() => {});
  process.exit(1);
});
