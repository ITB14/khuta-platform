import { redirect } from 'next/navigation';
import { GovStrip, PlatformBar, DemoBanner } from '../../../components/Chrome';
import Back from '../../../components/Back';
import SignOutButton from '../../dashboard/SignOutButton';
import PlanEditor from './PlanEditor';
const db = require('../../../src/db');
const S = require('../../../lib/session');
const A = require('../../../lib/authz');

export const dynamic = 'force-dynamic';

export default async function AcademyPlan({ searchParams }) {
  const user = await S.currentUser();
  const denial = A.staffDenial(user);
  if (denial === 'signin') redirect('/signin');
  if (denial) redirect('/dashboard');

  const sp = await searchParams;
  const now = new Date().getFullYear();
  const asked = Number(sp?.cycle);
  const cycle = Number.isInteger(asked) && asked >= 2024 && asked <= 2100 ? asked : now;
  const wide = A.isTenantWide(user);

  const data = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows: plans } = await c.query(
      `select id, cycle_year, title_ar, status, published_at
         from training_plan where cycle_year = $1`, [cycle]);
    const plan = plans[0] || null;

    // المسوّدة لا يراها غير الأكاديمية — والمنظر يقولها، لا هذه الصفحة.
    const { rows: items } = plan ? await c.query(`
      select r.*, i.notes, i.sort
        from plan_item_rollup r
        join visible_plan_item i on i.id = r.plan_item_id
       where r.plan_id = $1
       order by i.sort, r.subject_ar`, [plan.id]) : { rows: [] };

    const { rows: selections } = plan ? await c.query(`
      select s.plan_item_id, s.department_id, s.seats, s.priority, d.name_ar as dept_name
        from plan_selection s
        join department d on d.id = s.department_id
        join plan_item i on i.id = s.plan_item_id
       where i.plan_id = $1
       order by d.name_ar`, [plan.id]) : { rows: [] };

    // الإدارات التي يملك الاختيار لها
    const { rows: myDepartments } = await c.query(`
      select d.id, d.name_ar from department d
       where d.tenant_id = current_tenant() and d.is_active
         and (actor_is_tenant_wide() or d.id in (select my_scope_departments()))
       order by d.name_ar`);

    const { rows: skills } = await c.query(
      `select id, name_ar from skill where is_active order by name_ar`);
    const { rows: courses } = await c.query(
      `select id, title_ar from course order by title_ar`);
    const { rows: providers } = await c.query(
      `select id, name_ar from provider where is_active order by name_ar`);
    const { rows: pending } = await c.query(`
      select count(*)::int as n from training_need
       where cycle_year = $1 and status = 'approved'`, [cycle]);

    return { plan, items, selections, myDepartments, skills, courses, providers,
             approvedNeeds: pending[0].n };
  });

  const STATUS_AR = { draft: 'مسوّدة', published: 'منشورة', closed: 'مغلقة' };
  const target   = data.items.reduce((a, r) => a + Number(r.target_seats || 0), 0);
  const selected = data.items.reduce((a, r) => a + Number(r.selected_seats || 0), 0);

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap" style={{ maxWidth: 1100 }}>
        <Back href="/dashboard" label="الرئيسية" here="الخطة التدريبية" />
        <h1>الخطة التدريبية · دورة {cycle}</h1>
        <p className="muted" style={{ marginBottom: 18, maxWidth: 860 }}>
          الاحتياج رغبةٌ تُرفع قبل أن تُعرف الموارد، والخطة التزامٌ يُنشر
          بمقاعد. ولذلك لا يُختار على مسوّدة: خطةٌ لم تُنشر بعد ليست وعدًا
          لأحد. {wide ? 'وبنودها تُبنى من الاحتياج المعتمد لا من جديد.'
                     : 'وتختار من بنودها ما يناسب موظفي إدارتك.'}
        </p>

        {data.plan ? (
          <div className="kpi" style={{ marginBottom: 18 }}>
            <div><b className="num">{STATUS_AR[data.plan.status]}</b><span>حال الخطة</span></div>
            <div><b className="num">{data.items.length}</b><span>بنودًا</span></div>
            <div><b className="num">{target}</b><span>مقعدًا مستهدفًا</span></div>
            <div>
              <b className={`num${selected > target ? ' no' : ''}`}>{selected}</b>
              <span>مقعدًا مطلوبًا</span>
            </div>
          </div>
        ) : null}

        <PlanEditor
          cycle={cycle}
          wide={wide}
          initial={data}
        />

        <p className="tiny muted" style={{ marginTop: 16 }}>
          إعادة بناء البنود من الاحتياج تُضيف الجديد ولا تمحو ما قُرِّر: مقاعدٌ
          عُدِّلت بقرار تبقى كما قُرِّرت. والإغلاق يمنع الالتزام الجديد على
          الجميع — الأكاديمية معها.
        </p>
      </main>
    </>
  );
}
