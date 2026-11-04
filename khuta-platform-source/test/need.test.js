'use strict';
// تحليل الاحتياج التدريبي — على قاعدة بيانات حيّة بدور khuta_app.
//
// ما يُثبَت هنا ثلاثة: أنّ الاحتياج يُرفع ممّن يملك رفعه فقط، وأنّ القيود
// تمنع الصفّ الذي لا يُقرأ (بلا موضوع، أو بموضوعين، أو فرديٌّ لعشرة)، وأنّ
// رقم الأكاديمية يُجمع من قاعدة البيانات لا من صفحة.
const db = require('../src/db');

let pass = 0, fail = 0;
const ok = (c, label) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`); };
const section = (t) => console.log(`\n--- ${t} ---`);

/** يُعيد true إن رُفض الكتابة — ونوع الخطأ إن أردنا تمييزه. */
async function rejected(tenantId, actor, sql, args) {
  try { await db.withTenant(tenantId, actor, (c) => c.query(sql, args)); return false; }
  catch (e) { return e.code || true; }
}

const tag = Date.now();
const YEAR = 2027;

(async () => {
  const alain = await db.resolveTenant('khuta.b14facilities.com', 'alain');
  if (!alain) throw new Error('لا جهة alain');
  const T = alain.id;

  const made = { depts: [], users: [], skills: [] };

  const ids = await db.withTenant(T, null, async (c) => {
    const dept = async (name, parent = null) => {
      const { rows } = await c.query(
        `insert into department (tenant_id, name_ar, parent_id)
         values (current_tenant(), $1, $2) returning id`, [name, parent]);
      made.depts.push(rows[0].id); return rows[0].id;
    };
    const user = async (n, deptName) => {
      const { rows } = await c.query(
        `insert into app_user (tenant_id, email, full_name_ar, department, status)
         values (current_tenant(), $1, $2, $3, 'active') returning id`,
        [`need_${tag}_${n}@alain.example`, `موظف ${n}`, deptName]);
      made.users.push(rows[0].id); return rows[0].id;
    };

    const nIdara = `إدارة احتياج ${tag}`, nQism = `قسم احتياج ${tag}`,
          nOther = `إدارة أخرى احتياج ${tag}`;
    const idara = await dept(nIdara);
    const qism  = await dept(nQism, idara);
    const other = await dept(nOther);

    const head    = await user('head', nIdara);
    const emp1    = await user('emp1', nIdara);
    const emp2    = await user('emp2', nQism);
    const emp3    = await user('emp3', nOther);
    const officer = await user('officer', nOther);

    await c.query(`insert into department_head (tenant_id, department_id, user_id)
                   values (current_tenant(), $1, $2)`, [idara, head]);
    await c.query(`insert into user_role_grant (tenant_id, user_id, role)
                   values (current_tenant(), $1, 'dept_head')`, [head]);
    await c.query(`insert into user_role_grant (tenant_id, user_id, role)
                   values (current_tenant(), $1, 'training_officer')`, [officer]);

    const { rows: sk } = await c.query(
      `insert into skill (tenant_id, name_ar) values (current_tenant(), $1) returning id`,
      [`مهارة ${tag}`]);
    made.skills.push(sk[0].id);

    const { rows: co } = await c.query(
      `select id from course where tenant_id = current_tenant() limit 1`);

    return { idara, qism, other, head, emp1, emp2, emp3, officer,
             skill: sk[0].id, course: co[0]?.id || null };
  });

  const INS = `insert into training_need
                 (tenant_id, cycle_year, scope, department_id, user_id,
                  skill_id, course_id, title_ar, headcount, priority, source,
                  justification, status, raised_by)
               values (current_tenant(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
               returning id`;

  const raise = (actor, o) => db.withTenant(T, actor, async (c) => (await c.query(INS, [
    o.year ?? YEAR, o.scope, o.department_id ?? null, o.user_id ?? null,
    o.skill_id ?? null, o.course_id ?? null, o.title_ar ?? null,
    o.headcount ?? 1, o.priority ?? 'medium', o.source,
    o.justification ?? null, o.status ?? 'draft', actor,
  ])).rows[0].id);

  const tryRaise = (actor, o) => rejected(T, actor, INS, [
    o.year ?? YEAR, o.scope, o.department_id ?? null, o.user_id ?? null,
    o.skill_id ?? null, o.course_id ?? null, o.title_ar ?? null,
    o.headcount ?? 1, o.priority ?? 'medium', o.source,
    o.justification ?? null, o.status ?? 'draft', actor,
  ]);

  // ------------------------------------------------- من يملك الرفع -------
  section('من يملك رفع الاحتياج');
  const n1 = await raise(ids.head, {
    scope: 'individual', user_id: ids.emp1, skill_id: ids.skill,
    source: 'manager', status: 'submitted', justification: 'يحتاجها في عمله' });
  ok(!!n1, 'رئيس الإدارة يرفع احتياجًا لموظّف إدارته');

  const n2 = await raise(ids.head, {
    scope: 'individual', user_id: ids.emp2, skill_id: ids.skill,
    source: 'manager', status: 'submitted' });
  ok(!!n2, 'ويرفع لموظّف القسم التابع له');

  const n3 = await raise(ids.head, {
    scope: 'department', department_id: ids.idara, skill_id: ids.skill,
    headcount: 12, priority: 'high', source: 'department', status: 'submitted' });
  ok(!!n3, 'ويرفع احتياجًا مؤسسيًّا لإدارته باثني عشر موظفًا');

  ok(await tryRaise(ids.head, {
    scope: 'individual', user_id: ids.emp3, skill_id: ids.skill, source: 'manager' }),
    'ولا يرفع لموظّف إدارة أخرى');

  ok(await tryRaise(ids.head, {
    scope: 'department', department_id: ids.other, skill_id: ids.skill,
    headcount: 5, source: 'department' }),
    'ولا يرفع احتياجًا لإدارة ليست له');

  ok(await tryRaise(ids.head, {
    scope: 'department', department_id: ids.idara, skill_id: ids.skill,
    headcount: 3, source: 'department', status: 'approved' }),
    'ولا يعتمد ما يرفعه بنفسه');

  const n4 = await raise(ids.officer, {
    scope: 'department', department_id: ids.other, course_id: ids.course,
    headcount: 7, source: 'department', status: 'approved' });
  ok(!!n4, 'ومنسّق التدريب يرفع لأي إدارة ويعتمد');

  // الموظف نفسه يملك إعلان احتياجه
  const n5 = await raise(ids.emp1, {
    scope: 'individual', user_id: ids.emp1, title_ar: `موضوع جديد ${tag}`,
    source: 'self', status: 'submitted' });
  ok(!!n5, 'والموظّف يُعلن احتياج نفسه بعنوانٍ حرّ لا دورة له بعد');

  ok(await tryRaise(ids.emp1, {
    scope: 'individual', user_id: ids.emp2, skill_id: ids.skill, source: 'self' }),
    'ولا يُعلن احتياجًا باسم زميله');

  // -------------------------------------------------------- القيود -------
  section('الصفّ الذي لا يُقرأ يُرفض');
  ok(await tryRaise(ids.officer, { scope: 'individual', user_id: ids.emp1, source: 'manager' }),
     'احتياج بلا موضوع');
  ok(await tryRaise(ids.officer, {
    scope: 'individual', user_id: ids.emp1, skill_id: ids.skill,
    title_ar: 'وعنوان أيضًا', source: 'manager' }), 'واحتياج بموضوعين');
  ok(await tryRaise(ids.officer, { scope: 'individual', skill_id: ids.skill, source: 'manager' }),
     'واحتياج فردي بلا موظّف');
  ok(await tryRaise(ids.officer, {
    scope: 'individual', user_id: ids.emp3, skill_id: ids.skill,
    headcount: 4, source: 'manager' }), 'واحتياج فردي لأربعة أشخاص');
  ok(await tryRaise(ids.officer, {
    scope: 'department', department_id: ids.other, skill_id: ids.skill,
    headcount: 0, source: 'department' }), 'واحتياج إدارة بصفر موظفين');
  ok(await tryRaise(ids.head, {
    scope: 'individual', user_id: ids.emp1, skill_id: ids.skill,
    source: 'manager', status: 'submitted' }),
    'والاحتياج نفسه للموظّف نفسه في الدورة نفسها لا يتكرّر');

  // ------------------------------------------------------- ما يُرى -------
  section('مدى الرؤية');
  const seen = (actor) => db.withTenant(T, actor, async (c) =>
    (await c.query(`select id, scope from visible_training_need
                     where cycle_year = $1`, [YEAR])).rows);

  const headSees = await seen(ids.head);
  ok(headSees.length === 4 && headSees.every((r) => [n1, n2, n3, n5].includes(r.id)),
     'رئيس الإدارة يرى أربعة: ثلاثة رفعها وواحدًا أعلنه موظّفه');
  ok(!headSees.some((r) => r.id === n4), 'ولا يرى احتياج الإدارة الأخرى');

  const empSees = await seen(ids.emp1);
  ok(empSees.length === 2 && empSees.every((r) => [n1, n5].includes(r.id)),
     'والموظّف يرى ما رُفع له وما أعلنه — لا احتياج إدارته');

  const offSees = await seen(ids.officer);
  ok(offSees.length >= 5, 'ومنسّق التدريب يرى الجهة كلّها');

  // ------------------------------------------------- رقم الأكاديمية -----
  section('تجميع الطلب');
  const roll = await db.withTenant(T, ids.officer, async (c) =>
    (await c.query(`select subject_kind, subject_ar, departments, people,
                           dept_entries, individual_entries, high_priority, approved_entries
                      from training_need_rollup
                     where cycle_year = $1 order by people desc`, [YEAR])).rows);

  const bySkill = roll.find((r) => r.subject_ar === `مهارة ${tag}`);
  ok(bySkill && Number(bySkill.people) === 14,
     'المهارة تُجمع: اثنا عشر من الإدارة واثنان فرديّان = أربعة عشر');
  ok(bySkill && Number(bySkill.individual_entries) === 2 && Number(bySkill.dept_entries) === 1,
     'والمصدران مفصولان — ما يريده الموظفون لا يُخلط بما تطلبه الإدارة');
  ok(bySkill && Number(bySkill.high_priority) === 1, 'وتُعدّ الأولوية العالية');

  const free = roll.find((r) => r.subject_ar === `موضوع جديد ${tag}`);
  ok(free && free.subject_kind === 'free',
     'والعنوان الحرّ يظهر في التجميع — أوّل طلبٍ لموضوعٍ يسبق وجود دورته');

  // التجميع يتبع مدى الرؤية: رئيس الإدارة يجمع إدارته لا الجهة.
  const headRoll = await db.withTenant(T, ids.head, async (c) =>
    (await c.query(`select sum(people) as p, max(departments) as d
                      from training_need_rollup
                     where cycle_year = $1 and skill_id = $2`, [YEAR, ids.skill])).rows[0]);
  ok(Number(headRoll.p) === 14 && Number(headRoll.d) === 1,
     'ورقم رئيس الإدارة إدارته وحدها — التجميع يتبع مدى الرؤية');

  // مسوّدة لا تُحتسب
  await raise(ids.officer, {
    scope: 'department', department_id: ids.other, skill_id: ids.skill,
    headcount: 99, source: 'department', status: 'draft' });
  const roll2 = await db.withTenant(T, ids.officer, async (c) =>
    (await c.query(`select sum(people) as p from training_need_rollup
                     where cycle_year = $1 and skill_id = $2`, [YEAR, ids.skill])).rows[0]);
  ok(Number(roll2.p) === 14, 'والمسوّدة لا تدخل الرقم حتى تُرفع');

  // ------------------------------------------------------------ تنظيف ---
  await db.withTenant(T, null, async (c) => {
    await c.query('delete from training_need where tenant_id = current_tenant() and cycle_year = $1', [YEAR]);
    await c.query('delete from user_role_grant where user_id = any($1)', [made.users]);
    await c.query('delete from department_head where user_id = any($1)', [made.users]);
    await c.query('delete from app_user where id = any($1)', [made.users]);
    await c.query('delete from skill where id = any($1)', [made.skills]);
    await c.query('delete from department where id = any($1)', [made.depts.slice().reverse()]);
  });

  console.log(`\n${pass} PASS · ${fail} FAIL`);
  await db.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
