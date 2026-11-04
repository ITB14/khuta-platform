'use strict';
// الأدوار والنطاق الإداري — تُشغَّل على قاعدة بيانات حيّة بدور khuta_app.
// القاعدة المُختبَرة هنا واحدة: رئيس الإدارة يرى إدارته وفروعها ولا يرى غيرها.
// وما يجعل الفحص ذا معنى أنّ الحَكَم في قاعدة البيانات لا في الصفحة: كل
// استدعاء أدناه يمرّ بـ can_view_user نفسها التي تمرّ بها كل شاشة.
const db = require('../src/db');

let pass = 0, fail = 0;
const ok = (cond, label) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); };
const section = (t) => console.log(`\n--- ${t} ---`);

const tag = Date.now();
const mail = (n) => `rbac_${tag}_${n}@alain.example`;

(async () => {
  const alain = await db.resolveTenant('khuta.b14facilities.com', 'alain');
  const bki   = await db.resolveTenant('bki.khuta.b14facilities.com', 'alain');
  if (!alain) throw new Error('لا جهة alain');

  const made = { depts: [], users: [] };

  // ----------------------------------------------------------- التهيئة ----
  const dept = async (c, name, parent = null) => {
    const { rows } = await c.query(
      `insert into department (tenant_id, name_ar, parent_id)
       values (current_tenant(), $1, $2) returning id`, [name, parent]);
    made.depts.push(rows[0].id);
    return rows[0].id;
  };
  // الانتماء يُكتب بالاسم لا بالمعرّف: مُحفِّزة المرآة على app_user تشتقّ
  // المعرّف من النصّ عند الإدخال، فكتابة المعرّف وحده تُمحى. وهذا هو مسار
  // الكتابة الفعلي في المنصة (الاستيراد يأتي بأسماء)، فالفحص يسلكه نفسه.
  const user = async (c, n, deptName) => {
    const { rows } = await c.query(
      `insert into app_user (tenant_id, email, full_name_ar, department, status)
       values (current_tenant(), $1, $2, $3, 'active')
       returning id, department_id`,
      [mail(n), `موظف ${n}`, deptName]);
    if (deptName && !rows[0].department_id) throw new Error(`لم يُشتقّ معرّف الإدارة لـ ${n}`);
    made.users.push(rows[0].id);
    return rows[0].id;
  };

  const ids = await db.withTenant(alain.id, null, async (c) => {
    const nQitaa = `قطاع ${tag}`, nIdara = `إدارة ${tag}`,
          nQism  = `قسم ${tag}`,  nOther = `إدارة أخرى ${tag}`;
    const qitaa  = await dept(c, nQitaa);                           // الجذر
    const idara  = await dept(c, nIdara, qitaa);                    // ابنه
    const qism   = await dept(c, nQism, idara);                     // حفيده
    const other  = await dept(c, nOther);                           // خارج الشجرة

    const top    = await user(c, 'top',   nQitaa);                  // في القطاع نفسه
    const head   = await user(c, 'head',  nIdara);
    const emp1   = await user(c, 'emp1',  nIdara);
    const emp2   = await user(c, 'emp2',  nQism);                   // في الفرع
    const emp3   = await user(c, 'emp3',  nOther);                  // خارجها
    const lone   = await user(c, 'lone',  null);                    // بلا إدارة
    const boss   = await user(c, 'boss',  nOther);                  // منسّق تدريب

    await c.query(`insert into department_head (tenant_id, department_id, user_id)
                   values (current_tenant(), $1, $2)`, [idara, head]);
    await c.query(`insert into user_role_grant (tenant_id, user_id, role)
                   values (current_tenant(), $1, 'dept_head')`, [head]);
    await c.query(`insert into user_role_grant (tenant_id, user_id, role)
                   values (current_tenant(), $1, 'training_officer')`, [boss]);

    return { qitaa, idara, qism, other, top, head, emp1, emp2, emp3, lone, boss };
  });

  const sees = (actor, target) => db.withTenant(alain.id, actor, async (c) =>
    (await c.query('select can_view_user($1) as v', [target])).rows[0].v);

  const visible = (actor) => db.withTenant(alain.id, actor, async (c) =>
    (await c.query('select id from visible_user')).rows.map((r) => r.id));

  // -------------------------------------------------------- رئيس إدارة ----
  section('رئيس الإدارة');
  ok(await sees(ids.head, ids.head), 'يرى نفسه');
  ok(await sees(ids.head, ids.emp1), 'ويرى موظّف إدارته');
  ok(await sees(ids.head, ids.emp2), 'ويرى موظّف القسم التابع لإدارته');
  ok(!(await sees(ids.head, ids.emp3)), 'ولا يرى موظّف إدارة أخرى');
  ok(!(await sees(ids.head, ids.lone)), 'ولا يرى من لا إدارة له');

  const headScope = await db.withTenant(alain.id, ids.head, async (c) =>
    (await c.query('select * from my_scope_departments()')).rows.map((r) => Object.values(r)[0]));
  ok(headScope.length === 2 && headScope.includes(ids.idara) && headScope.includes(ids.qism),
     'ونطاقه إدارته وفرعها فقط — لا القطاع فوقه');

  const headList = await visible(ids.head);
  ok(headList.length === 3 && [ids.head, ids.emp1, ids.emp2].every((u) => headList.includes(u)),
     'ومنظر visible_user يعيد ثلاثة لا أكثر');

  // ------------------------------------------------------------ موظّف ----
  section('موظّف بلا دور');
  ok(await sees(ids.emp1, ids.emp1), 'يرى نفسه');
  ok(!(await sees(ids.emp1, ids.emp2)), 'ولا يرى زميله في الإدارة نفسها');
  ok(!(await sees(ids.emp1, ids.head)), 'ولا يرى رئيسه');
  ok((await visible(ids.emp1)).length === 1, 'ومنظره صفٌّ واحد: هو');

  // -------------------------------------------------------- منسّق تدريب ---
  section('منسّق التدريب');
  ok(await sees(ids.boss, ids.emp1), 'يرى موظّفًا في إدارة ليست إدارته');
  ok(await sees(ids.boss, ids.lone), 'ويرى من لا إدارة له — فلا يسقط أحد من التقارير');
  ok((await visible(ids.boss)).length >= 6, 'ومنظره الجهة كلّها');

  // ------------------------------------------------- الرئاسة لا تُورَّث ---
  section('حدود النطاق');
  ok(!(await sees(ids.head, ids.top)), 'رئيس الإدارة لا يصعد إلى موظّفٍ في القطاع فوقه');

  // ------------------------------------------------------ عزل الجهات -----
  if (bki && bki.id !== alain.id) {
    const foreign = await db.withTenant(bki.id, null, async (c) =>
      (await c.query(`select id from app_user where tenant_id = current_tenant() limit 1`)).rows[0]?.id);
    if (foreign) {
      ok(!(await sees(ids.boss, foreign)),
         'ومنسّق تدريب جهةٍ لا يرى مستخدم جهةٍ أخرى — العزل فوق الدور');
    }
  }

  // ------------------------------------------------- حذف الرئاسة يسري ----
  section('سحب الرئاسة');
  await db.withTenant(alain.id, null, async (c) =>
    c.query('delete from department_head where user_id = $1', [ids.head]));
  ok(!(await sees(ids.head, ids.emp1)), 'سحب الرئاسة يسري على الطلب التالي بلا انتظار جلسة');

  // ------------------------------------------------------------ تنظيف ----
  await db.withTenant(alain.id, null, async (c) => {
    await c.query('delete from user_role_grant where user_id = any($1)', [made.users]);
    await c.query('delete from department_head where user_id = any($1)', [made.users]);
    await c.query('delete from app_user where id = any($1)', [made.users]);
    await c.query('delete from department where id = any($1)', [made.depts.slice().reverse()]);
  });

  console.log(`\n${pass} PASS · ${fail} FAIL`);
  await db.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
