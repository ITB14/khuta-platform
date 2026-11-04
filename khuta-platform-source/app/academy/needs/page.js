import { redirect } from 'next/navigation';
import { GovStrip, PlatformBar, DemoBanner } from '../../../components/Chrome';
import Back from '../../../components/Back';
import SignOutButton from '../../dashboard/SignOutButton';
import NeedsEditor from './NeedsEditor';
const db = require('../../../src/db');
const S = require('../../../lib/session');
const A = require('../../../lib/authz');

export const dynamic = 'force-dynamic';

export default async function AcademyNeeds({ searchParams }) {
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
    // الإدارات التي يملك الرفع لها: الجهة كلّها للأكاديمية، وشجرته للرئيس.
    const { rows: departments } = await c.query(`
      select d.id, d.name_ar from department d
       where d.tenant_id = current_tenant() and d.is_active
         and (actor_is_tenant_wide() or d.id in (select my_scope_departments()))
       order by d.name_ar`);

    const { rows: people } = await c.query(`
      select id, full_name_ar, email from visible_user
       where status <> 'suspended' order by full_name_ar limit 800`);

    const { rows: skills } = await c.query(
      `select id, name_ar from skill where is_active order by name_ar`);
    const { rows: courses } = await c.query(
      `select id, title_ar from course order by title_ar`);

    const { rows: needs } = await c.query(`
      select n.id, n.scope, n.headcount, n.priority, n.source, n.status,
             n.justification, n.created_at,
             coalesce(s.name_ar, co.title_ar, n.title_ar) as subject_ar,
             d.name_ar  as dept_name,
             u.full_name_ar as person_name,
             rb.full_name_ar as raiser_name
        from visible_training_need n
        left join skill      s  on s.id  = n.skill_id
        left join course     co on co.id = n.course_id
        left join department d  on d.id  = n.department_id
        left join app_user   u  on u.id  = n.user_id
        left join app_user   rb on rb.id = n.raised_by
       where n.cycle_year = $1
       order by n.created_at desc`, [cycle]);

    const { rows: rollup } = await c.query(`
      select subject_ar, subject_kind, departments, people,
             dept_entries, individual_entries, high_priority, approved_entries
        from training_need_rollup
       where cycle_year = $1
       order by people desc, subject_ar`, [cycle]);

    return { departments, people, skills, courses, needs, rollup };
  });

  const totalPeople = data.rollup.reduce((a, r) => a + Number(r.people || 0), 0);
  const waiting = data.needs.filter((n) => n.status === 'submitted').length;

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap" style={{ maxWidth: 1100 }}>
        <Back href="/dashboard" label="الرئيسية" here="الاحتياج التدريبي" />
        <h1>الاحتياج التدريبي · دورة {cycle}</h1>
        <p className="muted" style={{ marginBottom: 18, maxWidth: 860 }}>
          من هنا تُبنى الخطة السنوية. والاحتياج مصدران لا يُخلطان: ما تطلبه
          الإدارة لعملها، وما يُعلنه الموظف لنفسه — ومن يريد لا يُطابق دائمًا
          ما يلزم العمل، وإخفاء الفرق يُفسد ترتيب الأولويات.
          {wide ? null : ' وما تراه هنا إدارتك وفروعها.'}
        </p>

        <div className="kpi" style={{ marginBottom: 18 }}>
          <div><b className="num">{data.needs.length}</b><span>احتياجات مسجّلة</span></div>
          <div><b className="num">{totalPeople}</b><span>موظفًا مطلوب تدريبهم</span></div>
          <div><b className="num">{data.rollup.length}</b><span>موضوعًا</span></div>
          <div>
            <b className={`num${waiting ? ' no' : ''}`}>{waiting}</b>
            <span>بانتظار الاعتماد</span>
          </div>
        </div>

        <NeedsEditor
          cycle={cycle}
          wide={wide}
          initial={data}
          me={{ id: user.id, name: user.full_name_ar }}
        />

        <p className="tiny muted" style={{ marginTop: 16 }}>
          الاعتماد والرفض من صلاحية الأكاديمية وحدها — وتمنعه قاعدة البيانات لا
          إخفاءُ زرّ، فمن يرفع لا يعتمد لنفسه. والمسوّدة لا تدخل أرقام التجميع
          حتى تُرفع للمراجعة.
        </p>
      </main>
    </>
  );
}
