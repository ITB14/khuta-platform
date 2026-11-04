'use strict';
// الخطة التدريبية السنوية — على قاعدة بيانات حيّة بدور khuta_app.
//
// ما يُثبَت هنا أربعة: أنّ الخطة ملكُ الأكاديمية وحدها، وأنّ المسوّدة لا
// يراها أحد قبل نشرها، وأنّ رئيس الإدارة يختار منها لإدارته لا لغيرها،
// وأنّ بناء البنود من الاحتياج لا يمحو ما قُرِّر.
const db = require('../src/db');

let pass = 0, fail = 0;
const ok = (c, label) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`); };
const section = (t) => console.log(`\n--- ${t} ---`);

async function rejected(T, actor, sql, args) {
  try { await db.withTenant(T, actor, (c) => c.query(sql, args)); return false; }
  catch (e) { return e.code || true; }
}

const tag = Date.now();
const YEAR = 2031;

(async () => {
  const alain = await db.resolveTenant('khuta.b14facilities.com', 'alain');
  const T = alain.id;
  const made = { depts: [], users: [], skills: [], plans: [] };

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
        [`plan_${tag}_${n}@alain.example`, `موظف ${n}`, deptName]);
      made.users.push(rows[0].id); return rows[0].id;
    };

    const nIdara = `إدارة خطة ${tag}`, nQism = `قسم خطة ${tag}`, nOther = `إدارة أخرى خطة ${tag}`;
    const idara = await dept(nIdara);
    const qism  = await dept(nQism, idara);
    const other = await dept(nOther);

    const head    = await user('head', nIdara);
    const emp     = await user('emp', nIdara);
    const officer = await user('officer', nOther);

    await c.query(`insert into department_head (tenant_id, department_id, user_id)
                   values (current_tenant(), $1, $2)`, [idara, head]);
    await c.query(`insert into user_role_grant (tenant_id, user_id, role)
                   values (current_tenant(), $1, 'dept_head')`, [head]);
    await c.query(`insert into user_role_grant (tenant_id, user_id, role)
                   values (current_tenant(), $1, 'training_officer')`, [officer]);

    const { rows: sk } = await c.query(
      `insert into skill (tenant_id, name_ar) values (current_tenant(), $1) returning id`,
      [`مهارة خطة ${tag}`]);
    made.skills.push(sk[0].id);

    // احتياجان معتمدان في الدورة: واحدٌ للإدارة بعشرة وآخر فردي.
    await c.query(`insert into training_need
        (tenant_id, cycle_year, scope, department_id, skill_id, headcount, source, status, raised_by)
       values (current_tenant(), $1, 'department', $2, $3, 10, 'department', 'approved', $4)`,
      [YEAR, idara, sk[0].id, officer]);
    await c.query(`insert into training_need
        (tenant_id, cycle_year, scope, user_id, skill_id, headcount, source, status, raised_by)
       values (current_tenant(), $1, 'individual', $2, $3, 1, 'manager', 'approved', $4)`,
      [YEAR, emp, sk[0].id, officer]);
    // ومسوّدةٌ لا تدخل البناء.
    await c.query(`insert into training_need
        (tenant_id, cycle_year, scope, department_id, title_ar, headcount, source, status, raised_by)
       values (current_tenant(), $1, 'department', $2, $3, 99, 'department', 'draft', $4)`,
      [YEAR, other, `موضوع مسوّدة ${tag}`, officer]);

    return { idara, qism, other, head, emp, officer, skill: sk[0].id };
  });

  // ------------------------------------------------- ملكيّة الخطة --------
  section('الخطة ملك الأكاديمية');
  const MKPLAN = `insert into training_plan (tenant_id, cycle_year, title_ar)
                  values (current_tenant(), $1, $2) returning id`;
  ok(await rejected(T, ids.head, MKPLAN, [YEAR, `خطة ${tag}`]),
     'رئيس الإدارة لا يُنشئ خطة');

  const plan = await db.withTenant(T, ids.officer, async (c) =>
    (await c.query(MKPLAN, [YEAR, `خطة ${tag}`])).rows[0].id);
  made.plans.push(plan);
  ok(!!plan, 'ومنسّق التدريب يُنشئها');

  ok(await rejected(T, ids.officer, MKPLAN, [YEAR, `خطة ثانية ${tag}`]),
     'ولا خطّتان لدورةٍ واحدة');

  // --------------------------------------------------- بناء البنود -------
  section('البنود من الاحتياج المعتمد');
  ok(await rejected(T, ids.head, 'select plan_items_from_needs($1)', [plan]),
     'رئيس الإدارة لا يبني البنود');

  const built = await db.withTenant(T, ids.officer, async (c) =>
    (await c.query('select plan_items_from_needs($1) as n', [plan])).rows[0].n);
  ok(built === 1, 'والبناء يُنشئ بندًا واحدًا — الموضوع واحد وإن تعدّد مصدره');

  const item = await db.withTenant(T, ids.officer, async (c) =>
    (await c.query('select id, target_seats from plan_item where plan_id = $1', [plan])).rows[0]);
  ok(Number(item.target_seats) === 11,
     'ومقاعده أحد عشر: عشرة من الإدارة وواحد فردي — والمسوّدة لم تدخل');

  // تعديل المقاعد بقرار، ثم إعادة البناء
  await db.withTenant(T, ids.officer, (c) =>
    c.query('update plan_item set target_seats = 6 where id = $1', [item.id]));
  const again = await db.withTenant(T, ids.officer, async (c) =>
    (await c.query('select plan_items_from_needs($1) as n', [plan])).rows[0].n);
  const after = await db.withTenant(T, ids.officer, async (c) =>
    (await c.query('select target_seats from plan_item where id = $1', [item.id])).rows[0]);
  ok(again === 0 && Number(after.target_seats) === 6,
     'وإعادة البناء لا تمحو ما قُرِّر — ستة تبقى ستة');

  ok(await rejected(T, ids.officer,
    `insert into plan_item (tenant_id, plan_id, skill_id, target_seats)
     values (current_tenant(), $1, $2, 3)`, [plan, ids.skill]),
    'ولا يتكرّر الموضوع في الخطة الواحدة');

  // ------------------------------------------------- المسوّدة لا تُرى ----
  section('المسوّدة ليست وعدًا');
  const headSeesDraft = await db.withTenant(T, ids.head, async (c) =>
    (await c.query('select id from visible_plan_item where plan_id = $1', [plan])).rows);
  ok(headSeesDraft.length === 0, 'رئيس الإدارة لا يرى بنود خطةٍ لم تُنشر');

  ok(await rejected(T, ids.officer,
    `insert into plan_selection (tenant_id, plan_item_id, department_id, seats, selected_by)
     values (current_tenant(), $1, $2, 3, $3)`, [item.id, ids.idara, ids.officer]),
    'ولا يُختار على مسوّدة — ولو كان المختار الأكاديمية');

  // ------------------------------------------------------ بعد النشر ------
  section('بعد النشر');
  await db.withTenant(T, ids.officer, (c) => c.query(
    `update training_plan set status = 'published', published_at = now(),
            published_by = current_actor() where id = $1`, [plan]));

  const headSees = await db.withTenant(T, ids.head, async (c) =>
    (await c.query('select id from visible_plan_item where plan_id = $1', [plan])).rows);
  ok(headSees.length === 1, 'ورئيس الإدارة يرى البند بعد النشر');

  const SEL = `insert into plan_selection (tenant_id, plan_item_id, department_id, seats, priority, selected_by)
               values (current_tenant(), $1, $2, $3, $4, $5)`;

  await db.withTenant(T, ids.head, (c) =>
    c.query(SEL, [item.id, ids.idara, 4, 'high', ids.head]));
  ok(true, 'ويختار أربعة مقاعد لإدارته');

  await db.withTenant(T, ids.head, (c) =>
    c.query(SEL, [item.id, ids.qism, 2, 'medium', ids.head]));
  ok(true, 'ولقسمٍ تابع له');

  ok(await rejected(T, ids.head, SEL, [item.id, ids.other, 5, 'low', ids.head]),
     'ولا يختار لإدارة ليست له');

  await db.withTenant(T, ids.officer, (c) =>
    c.query(SEL, [item.id, ids.other, 3, 'low', ids.officer]));
  ok(true, 'والأكاديمية تختار لأي إدارة');

  ok(await rejected(T, ids.head, SEL, [item.id, ids.idara, 1, 'low', ids.head]),
     'ولا تُختار الإدارة نفسها مرّتين على البند نفسه');

  // ----------------------------------------------------- المستهدف مقابل -
  section('المستهدف مقابل المطلوب');
  const roll = await db.withTenant(T, ids.officer, async (c) =>
    (await c.query(`select subject_ar, subject_kind, target_seats, selected_seats,
                           departments, need_people
                      from plan_item_rollup where plan_id = $1`, [plan])).rows[0]);
  ok(Number(roll.target_seats) === 6 && Number(roll.selected_seats) === 9,
     'المختار تسعة على مستهدفٍ ستة — والفجوة ظاهرة لا مخفيّة');
  ok(Number(roll.departments) === 3, 'وثلاث إدارات اختارت');
  ok(Number(roll.need_people) === 11, 'والاحتياج المعتمد أحد عشر — الأصل باقٍ للمقارنة');

  const headRoll = await db.withTenant(T, ids.head, async (c) =>
    (await c.query(`select selected_seats, departments from plan_item_rollup
                     where plan_id = $1`, [plan])).rows[0]);
  ok(Number(headRoll.selected_seats) === 9,
     'ورئيس الإدارة يرى مجموع المقاعد على البند — البند عامٌّ بعد نشره');

  // --------------------------------------------------------- الإغلاق ----
  section('الإغلاق');
  await db.withTenant(T, ids.officer, (c) =>
    c.query(`update training_plan set status = 'closed' where id = $1`, [plan]));
  ok(await rejected(T, ids.head, SEL, [item.id, ids.idara, 1, 'low', ids.head]),
     'خطةٌ مغلقة لا يُختار عليها');
  ok(await rejected(T, ids.officer, SEL, [item.id, ids.idara, 1, 'low', ids.officer]),
     'ولا الأكاديمية — الإغلاق يسري على الجميع');

  // --------------------------------------------------- الحذف يحذف ------
  // مُحفِّزة BEFORE DELETE تُعيد old لا new؛ وإعادة الفارغ تُلغي العملية
  // بصمت فيُقال «حُذف» ولم يُحذف. هذا الفحص يمنع عودة ذلك.
  section('الحذف يحذف فعلًا');
  await db.withTenant(T, ids.officer, (c) =>
    c.query('delete from plan_item where id = $1', [item.id]));
  const leftItems = await db.withTenant(T, ids.officer, async (c) =>
    (await c.query('select count(*)::int as n from plan_item where plan_id = $1', [plan])).rows[0].n);
  ok(leftItems === 0, 'الأكاديمية تحذف بندًا فيُحذف — لا صمت');
  const leftSel = await db.withTenant(T, ids.officer, async (c) =>
    (await c.query('select count(*)::int as n from plan_selection where plan_item_id = $1',
                   [item.id])).rows[0].n);
  ok(leftSel === 0, 'واختياراته تسقط معه');

  // ------------------------------------------------------------ تنظيف ---
  await db.withTenant(T, null, async (c) => {
    await c.query('delete from plan_selection where plan_item_id = $1', [item.id]);
    await c.query('delete from plan_item where plan_id = any($1)', [made.plans]);
    await c.query('delete from training_plan where id = any($1)', [made.plans]);
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
