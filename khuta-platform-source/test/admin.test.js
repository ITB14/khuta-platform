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
  call.cookie = () => jar;              // لفحص يحتاج الطلب الخام لا المغلّف
  return call;

  async function call(path, { method = 'GET', body } = {}) {
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

  // ------------------------------------------------------------- الإدارات
  section('الإدارات');
  // فحص الـ403 للمتعلّم يأتي لاحقًا مع `back`: الجلسة المسمّاة learner هنا
  // صارت إدارية بعد setAdmin، والأدوار تُقرأ مع كل طلب.
  // 409 هنا ليس فشلًا: المجموعة تُعاد على قاعدة لم تُصفَّر، والمطلوب وجودها.
  for (const n of ['الموارد البشرية', 'الشؤون الهندسية', 'الصحة العامة']) {
    const r = await admin('/api/admin/departments', { method: 'POST', body: { nameAr: n } });
    if (!r.json?.ok && r.status !== 409) ok(false, `تعذّر إنشاء ${n}: ${r.json?.error}`);
  }
  ok(true, 'ثلاث إدارات موجودة');

  // التكرار هو العلّة التي وُجد الجدول لأجلها، فيُردّ بالاسم لا برمز خطأ.
  const dupDept = await admin('/api/admin/departments', {
    method: 'POST', body: { nameAr: ' الصحة العامة ' },
  });
  ok(dupDept.status === 409 && /الصحة العامة/.test(dupDept.json?.error || ""),
     'واسم مكرّر يُردّ — وهذا ما يمنع «الصحة العامة» و«الصحة العامة والبيئة» من التكاثر');

  const list = await admin('/api/admin/departments');
  const hr = list.json.departments.find((d) => d.name_ar === 'الموارد البشرية');
  ok(!!hr && hr.is_active && hr.learners === 0, 'والقائمة تعود بها وبعدد موظفيها');

  const renamed = await admin(`/api/admin/departments/${hr.id}`, {
    method: 'PATCH', body: { nameAr: 'إدارة الموارد البشرية' },
  });
  ok(renamed.json?.department?.name_ar === 'إدارة الموارد البشرية', 'وتُعاد تسميتها');
  await admin(`/api/admin/departments/${hr.id}`, {
    method: 'PATCH', body: { nameAr: 'الموارد البشرية' },
  });

  const off = await admin(`/api/admin/departments/${hr.id}`, {
    method: 'PATCH', body: { isActive: false },
  });
  ok(off.json?.department?.is_active === false, 'وتُعطَّل');
  await admin(`/api/admin/departments/${hr.id}`, { method: 'PATCH', body: { isActive: true } });

  const cycle = await admin(`/api/admin/departments/${hr.id}`, {
    method: 'PATCH', body: { parentId: hr.id },
  });
  ok(cycle.status === 400, 'ولا تكون أبًا لنفسها');

  // الدمج: ما يُصلح الازدواج الذي سبق الجدول. يُنقل الموظفون ثم تُعطَّل
  // المصدر — فلا يبقى موظف معلّقًا بإدارة لا تظهر في قائمة.
  const all = (await admin('/api/admin/departments')).json.departments;
  const src = all.find((d) => d.name_ar === 'الصحة العامة');
  const dst = all.find((d) => d.name_ar === 'الصحة العامة والبيئة');
  const before = src.learners;
  ok(before > 0 && !!dst, 'إدارتان متشابهتان وكلٌّ منهما تحمل موظفًا');

  ok((await admin(`/api/admin/departments/${src.id}/merge`,
      { method: 'POST', body: { intoId: src.id } })).status === 400,
     'ولا تُدمج إدارة في نفسها');

  const merged = await admin(`/api/admin/departments/${src.id}/merge`, {
    method: 'POST', body: { intoId: dst.id },
  });
  ok(merged.json?.ok && merged.json.moved === before,
     `ودمجُهما نقل ${merged.json?.moved} موظفًا`);

  const deptsAfter = (await admin('/api/admin/departments')).json.departments;
  const srcAfter = deptsAfter.find((d) => d.id === src.id);
  ok(srcAfter.learners === 0 && srcAfter.is_active === false,
     'والمصدر فارغ ومعطَّل — لا محذوف، فتقارير الأمس تبقى مفهومة');

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

  section('تصدير القائمة');
  // `back` متعلّم مستقلّ. و`learner` هو المستخدم نفسه الذي مُنح الدور بعدُ،
  // فجلسته صارت إدارية — الأدوار تُقرأ كل طلب، وهذه نتيجتها المقصودة.
  const csvDenied = await back('/api/admin/export');
  ok(csvDenied.status === 403, 'متعلّم لا يصدّر');
  const csv = await admin('/api/admin/export');
  ok(csv.status === 200, 'والمسؤول يصدّر');
  // بالبايتات لا بالنصّ: `Response.text()` يحذف علامة الترتيب عند فكّ
  // الترميز، فالفحص عليها من خلاله يمرّ دائمًا ولا يفحص شيئًا.
  const rawCsv = await fetch(`${BASE}/api/admin/export`, { headers: { cookie: admin.cookie() } });
  const head3 = new Uint8Array((await rawCsv.arrayBuffer()).slice(0, 3));
  ok(head3[0] === 0xEF && head3[1] === 0xBB && head3[2] === 0xBF,
     'والملف يبدأ بعلامة ترتيب البايتات — بدونها يشوّه Excel العربية');
  ok(csv.text.includes('البريد') && csv.text.includes(NEW_EMAIL),
     'وفيه العناوين والمتعلّمون');
  ok(!csv.text.includes(reset.json.password),
     'ولا يحمل كلمات مرور — يُرسل بالبريد ويُحفظ على أجهزة لا تحكمها المنصّة');
  ok(csv.text.includes('أصاب من أول محاولة') && csv.text.includes('أسئلة الاختبار'),
     'وفيه مؤشّر المحاولة الأولى — الرقم الدالّ بعد أن صار الاختبار يُعاد حتى الإتمام');

  // اللوحة نفسها تصرّح بما يعنيه العمودان، فلا يُقرأ «١٢/١٢» درجةَ نجاح ولا
  // يُقرأ متوسّط المكسب على أنه متوسّط الجميع.
  ok(roster.text.includes('مؤشّر للإدارة لا درجة نجاح')
     && roster.text.includes('لمن أدّى القياس'),
     'ولوحة المتعلّمين تشرح العمودين بدل أن تترك الرقمين يُفسَّران خطأً');

  section('تعديل بيانات متعلّم');
  const edited = await admin(`/api/admin/learners/${made.json.userId}`, {
    method: 'PATCH', body: { department: 'الشؤون الهندسية', jobTitle: 'مهندس' },
  });
  ok(edited.status === 200 && edited.json.learner.department === 'الشؤون الهندسية',
     'الإدارة تُحدَّث');
  const cleared = await admin(`/api/admin/learners/${made.json.userId}`, {
    method: 'PATCH', body: { department: '' },
  });
  ok(cleared.status === 200 && cleared.json.learner.department === null,
     'وحقل أُرسل فارغًا يُمسح فعلًا — لا يبقى كما كان');
  ok(cleared.json.learner.job_title === 'مهندس',
     'وحقل لم يُرسل يبقى كما هو');
  const emptyName = await admin(`/api/admin/learners/${made.json.userId}`, {
    method: 'PATCH', body: { fullNameAr: '  ' },
  });
  ok(emptyName.status === 400, 'والاسم لا يُفرَّغ');
  const editPriv = await admin(`/api/admin/learners/${adminId}`, {
    method: 'PATCH', body: { department: 'x' },
  });
  ok(editPriv.status === 403, 'والحساب الإداري لا يُعدَّل من هنا');

  // --------------------------------------------------------- التحليلات
  section('تقدّم الجهة بحسب الإدارة');
  const anaDenied = await back('/admin/analytics');
  ok(anaDenied.status === 307 || anaDenied.status === 302,
     'متعلّم لا يرى التحليلات — يُحوَّل إلى لوحته');

  const ana = await admin('/admin/analytics');
  ok(ana.status === 200 && ana.text.includes('بحسب الإدارة'), 'والمسؤول يراها');
  ok(ana.text.includes('الصحة العامة والبيئة'),
     'وفيها صفّ للإدارة التي تحمل موظفين');

  // المقام يشمل الموقوفين: إخراجهم يرفع النسبة بلا أن يتعلّم أحد.
  const prog = await db.withTenant(t.id, null, (c) => c.query(
    `select coalesce(d.name_ar,'بلا إدارة') name, p.enrolments, p.suspended,
            p.certified, p.overdue, p.measured
       from department_progress p left join department d on d.id = p.department_id
      order by p.enrolments desc`));
  const totalRows = prog.rows.reduce((a, r) => a + r.enrolments, 0);
  const learners = await db.withTenant(t.id, null, (c) => c.query(
    `select count(*)::int n from enrolment e join app_user u on u.id = e.user_id
       join user_role_grant g on g.user_id = u.id and g.role = 'learner'`));
  ok(totalRows === learners.rows[0].n,
     `ومجموع صفوفها يساوي التسجيلات كلّها — ${totalRows}، فلا تسقط إدارة ولا موظف`);
  ok(prog.rows.some((r) => r.name === 'بلا إدارة') || totalRows > 0,
     'ومن لا إدارة له له صفّه هو — لا يختفي من التقرير');

  // ---------------------------------------------- المهارات والطلب عليها
  section('المهارات والطلب على التعلّم');
  for (const [n, cat] of [['Excel المتقدّم', 'أدوات مكتبية'],
                          ['تحليل البيانات', 'تحليل'],
                          ['إدارة المشاريع', 'إدارة']]) {
    const r = await admin('/api/admin/skills', { method: 'POST', body: { nameAr: n, category: cat } });
    if (!r.json?.ok && r.status !== 409) ok(false, `تعذّر إنشاء ${n}: ${r.json?.error}`);
  }
  ok(true, 'ثلاث مهارات في الكتالوج');

  const dupSkill = await admin('/api/admin/skills', {
    method: 'POST', body: { nameAr: ' Excel المتقدّم ' },
  });
  ok(dupSkill.status === 409, 'واسم مكرّر يُردّ — الكتالوج مُعرَّف لا حرّ');

  // الموظف يعلن لنفسه. و`back` خرج من إعادة التعيين بكلمة مؤقّتة، وبوّابة
  // تغييرها تحجب مسارات المتعلّم كلّها — ومنها هذه. فيغيّرها أولًا كما يفعل.
  const SKILLS_PW = 'Maharati!Khuta2027';
  const pwForSkills = await back('/api/account/password', {
    method: 'POST', body: { currentPassword: reset.json.password, newPassword: SKILLS_PW },
  });
  ok(pwForSkills.status === 200, 'المتعلّم غيّر كلمته المؤقّتة قبل أن يُعلن عن مهاراته');

  const skillList = (await admin('/api/admin/skills')).json.skills;
  const excel = skillList.find((s) => s.name_ar === 'Excel المتقدّم');
  const pm = skillList.find((s) => s.name_ar === 'إدارة المشاريع');

  const declared = await back('/api/profile/skills', {
    method: 'POST', body: { skillId: excel.skill_id, stance: 'wants' },
  });
  ok(declared.json?.ok, 'والمتعلّم يعلن عن مهارة يريد تعلّمها');

  await back('/api/profile/skills', { method: 'POST', body: { skillId: pm.skill_id, stance: 'has' } });

  const bogus = await back('/api/profile/skills', {
    method: 'POST', body: { skillId: excel.skill_id, stance: 'expert' },
  });
  ok(bogus.status === 400, 'وحالة غير معروفة تُرفض');

  const skillsAfter = (await admin('/api/admin/skills')).json.skills;
  const excelAfter = skillsAfter.find((s) => s.skill_id === excel.skill_id);
  ok(excelAfter.wants === 1 && excelAfter.has === 0,
     'والطلب يُحتسب في اللوحة — واحد يريد تعلّمها');
  ok(skillsAfter[0].skill_id === excel.skill_id,
     'والترتيب بالطلب: المطلوبة أعلى الصفحة لا أسفلها');

  // تغيير الرأي يُحدِّث ولا يُضاعف — القيد على (الموظف، المهارة).
  await back('/api/profile/skills', { method: 'POST', body: { skillId: excel.skill_id, stance: 'learning' } });
  const moved = (await admin('/api/admin/skills')).json.skills
    .find((s) => s.skill_id === excel.skill_id);
  ok(moved.wants === 0 && moved.learning === 1 && moved.declared === 1,
     'وتغيير الحالة ينقل الإعلان ولا يُضاعفه');

  // السحب
  await back('/api/profile/skills', { method: 'POST', body: { skillId: excel.skill_id, stance: null } });
  const pulled = (await admin('/api/admin/skills')).json.skills
    .find((s) => s.skill_id === excel.skill_id);
  ok(pulled.declared === 0, 'وسحبُه يمحو الإعلان');

  // التعطيل يمنع الإضافة الجديدة ولا يمحو ما أُعلن
  await admin(`/api/admin/skills/${pm.skill_id}`, { method: 'PATCH', body: { isActive: false } });
  const onRetired = await back('/api/profile/skills', {
    method: 'POST', body: { skillId: pm.skill_id, stance: 'wants' },
  });
  ok(onRetired.status === 400, 'ومهارة معطّلة لا تُضاف من جديد');
  const kept = (await admin('/api/admin/skills')).json.skills
    .find((s) => s.skill_id === pm.skill_id);
  ok(kept.has === 1, 'ومن أعلنها قبل التعطيل يبقى إعلانه — التعطيل ليس حذفًا');
  await admin(`/api/admin/skills/${pm.skill_id}`, { method: 'PATCH', body: { isActive: true } });

  const skillDenied = await back('/api/admin/skills', {
    method: 'POST', body: { nameAr: 'مهارة متسلّلة' },
  });
  ok(skillDenied.status === 403, 'ومتعلّم لا يضيف إلى الكتالوج');

  section('استيراد دفعة من ملف');
  const BULK_A = `bulk1+${Date.now()}@alain.example`;
  const BULK_B = `bulk2+${Date.now()}@alain.example`;
  const csvIn = [
    'الاسم,البريد,الإدارة',
    // الاسم الباقي بعد الدمج أعلاه — والمدموجة صارت معطّلة فلا تُطابَق.
    `خالد سعيد النعيمي,${BULK_A},الصحة العامة والبيئة`,
    `عائشة راشد الظاهري,${BULK_B},التخطيط`,
    `مكرّر,${BULK_A},س`,
    'بلا بريد,,س',
    'بريد خاطئ,ليس-بريدًا,س',
  ].join('\n');
  const bulkDenied = await back('/api/admin/learners/bulk', { method: 'POST', body: { csv: csvIn } });
  ok(bulkDenied.status === 403, 'متعلّم لا يستورد');
  const deptDenied = await back('/api/admin/departments', {
    method: 'POST', body: { nameAr: 'إدارة متسلّلة' },
  });
  ok(deptDenied.status === 403, 'ولا ينشئ إدارة');

  const bulk = await admin('/api/admin/learners/bulk', { method: 'POST', body: { csv: csvIn } });
  ok(bulk.status === 200 && bulk.json.created === 2, 'صفّان صحيحان أُنشئا');
  ok(bulk.json.failed === 3, 'وثلاثة فشلت');
  const reasons = bulk.json.results.filter((r) => !r.ok).map((r) => r.error).join(' | ');
  ok(/مكرّر داخل الملف/.test(reasons), 'والمكرّر داخل الملف يُسمّى بسببه');
  ok(/بريد غير صالح/.test(reasons), 'والبريد الخاطئ كذلك');
  ok(bulk.json.results.filter((r) => !r.ok).every((r) => r.line >= 2),
     'وكل فشل يحمل رقم سطره في الملف');
  ok((await roles(BULK_A)).join() === 'learner', 'والمستورَد دوره learner');

  // الإدارة المعروفة تُربط، وغير المعروفة لا تُسقط الموظف ولا تُنشأ ضمنًا:
  // الحساب يُنشأ بلا إدارة ويُقال ذلك في سطره.
  const okRows = bulk.json.results.filter((r) => r.ok);
  const linked = okRows.find((r) => r.email === BULK_A);
  const warned = okRows.find((r) => r.email === BULK_B);
  ok(!linked.warn, 'وصاحب الإدارة المعروفة أُنشئ بلا ملاحظة');
  ok(warned && /التخطيط/.test(warned.warn || ''),
     'وصاحب الإدارة المجهولة أُنشئ ومعه ملاحظة باسمها — لا فشل ولا إدارة مخترَعة');
  const madeDepts = (await admin('/api/admin/departments')).json.departments;
  ok(!madeDepts.some((d) => d.name_ar === 'التخطيط'),
     'ولم يُنشئ الملفُّ إدارةً — وإلّا تكاثرت الإدارات من أخطاء الطباعة');

  const bulkNoCol = await admin('/api/admin/learners/bulk', {
    method: 'POST', body: { csv: 'الاسم,الإدارة\nس,ص' },
  });
  ok(bulkNoCol.status === 400 && /البريد/.test(bulkNoCol.json.error || ''),
     'وملفّ بلا عمود بريد يُرفض مرّة واحدة بسببه');

  section('صفحة الشهادة');
  const cert = await db.withTenant(t.id, null, async (c) => {
    const { rows } = await c.query(`
      insert into certificate (tenant_id, enrolment_id, serial, verify_code,
                               issued_to_name, course_title, score, content_hash)
      select current_tenant(), e.id, 'KHT-TEST-0001', 'TEST-0001',
             u.full_name_ar, co.title_ar, 0.900, sha256('x')
        from enrolment e join app_user u on u.id = e.user_id
        join course co on co.id = e.course_id
       where lower(u.email) = lower($1) limit 1
      returning serial`, [EMAIL]);
    return rows[0];
  });
  ok(!!cert, 'شهادة تجريبية للمتعلّم صاحب الجلسة');

  const mine = await learner(`/certificate/${cert.serial}`);
  ok(mine.status === 200 && mine.text.includes('شهادة إتمام دورة'), 'صاحبها يراها');

  // متعلّم من الدفعة المستورَدة — حساب مستقلّ تمامًا عن صاحب الشهادة.
  const madeA = bulk.json.results.find((r) => r.ok && r.email === BULK_A);
  const other = client();
  await signIn(other, BULK_A, madeA.password, madeA.mfaSecret);
  // يغيّر كلمته المؤقّتة أوّلًا، وإلّا حوّله حاجزها قبل أن يُفحص مالك الشهادة
  await other('/api/account/password', {
    method: 'POST', body: { currentPassword: madeA.password, newPassword: 'Mustaqil!2027aa' },
  });
  const notMine = await other(`/certificate/${cert.serial}`);
  ok(notMine.status === 404, 'ومتعلّم آخر لا يراها — ورقمها ليس مفتاحًا');

  const byAdmin = await admin(`/certificate/${cert.serial}`);
  ok(byAdmin.status === 200, 'والمسؤول يراها ليطبع نسخة');
  const ghost = await learner('/certificate/KHT-LA-YUJAD');
  ok(ghost.status === 404, 'ورقم لا وجود له يردّ 404');

  section('إيقاف الحساب');
  const live2 = client();
  await signIn(live2, NEW_EMAIL, reset.json.password, made.json.mfaSecret);
  const stopped = await admin(`/api/admin/learners/${made.json.userId}`, {
    method: 'PATCH', body: { status: 'suspended' },
  });
  ok(stopped.status === 200 && stopped.json.learner.status === 'suspended', 'أُوقف');
  ok(((await live2('/dashboard')).location || '').includes('/signin'),
     'وجلسته القائمة سقطت في الطلب التالي');
  const blocked = await client()('/api/auth/signin', {
    method: 'POST', body: { email: NEW_EMAIL, password: reset.json.password },
  });
  ok(blocked.status === 401 && /موقوف/.test(blocked.json?.message || ''),
     'ولا يدخل من جديد — ويُقال له إن الحساب موقوف');
  const resumed = await admin(`/api/admin/learners/${made.json.userId}`, {
    method: 'PATCH', body: { status: 'active' },
  });
  ok(resumed.status === 200 && resumed.json.learner.status === 'active', 'وإعادة التفعيل تردّه');

  // ---------------------------------------------------------------- cleanup
  await db.withTenant(t.id, null, (c) =>
    c.query('delete from app_user where lower(email) = any($1::text[])',
            [[NEW_EMAIL.toLowerCase(), BULK_A.toLowerCase(), BULK_B.toLowerCase()]]));
  await db.withTenant(t.id, null, (c) =>
    c.query(`delete from certificate where serial = 'KHT-TEST-0001'`));
  await setAdmin(false);

  console.log(`\n==========================================================`);
  console.log(`  ${pass} PASS · ${fail} FAIL`);
  console.log(`==========================================================`);
  await db.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
