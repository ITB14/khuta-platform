import { redirect } from 'next/navigation';
import { GovStrip, PlatformBar, DemoBanner } from '../../../components/Chrome';
import Back from '../../../components/Back';
import SignOutButton from '../../dashboard/SignOutButton';
import DepartmentsEditor from './DepartmentsEditor';
const db = require('../../../src/db');
const S = require('../../../lib/session');
const A = require('../../../lib/authz');

export const dynamic = 'force-dynamic';

export default async function DepartmentsPage() {
  const user = await S.currentUser();
  const denial = A.adminDenial(user);
  if (denial === 'signin') redirect('/signin');
  if (denial) redirect('/dashboard');

  const rows = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows } = await c.query(`
      select d.id, d.name_ar, d.name_en, d.code, d.is_active, d.parent_id,
             p.name_ar as parent_name,
             (select count(*) from app_user u where u.department_id = d.id)::int as learners
        from department d
        left join department p on p.id = d.parent_id
       order by coalesce(p.name_ar, d.name_ar), (d.parent_id is not null), d.name_ar`);
    return rows;
  });

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap" style={{ maxWidth: 1000 }}>
        <Back href="/admin" label="المتعلّمون" here="الإدارات" />
        <h1>إدارات {user.tenant.name_ar}</h1>
        <p className="muted" style={{ marginBottom: 20, maxWidth: 760 }}>
          كانت الإدارة حقلًا يُكتب باليد لكل موظف، فتعدّدت كتابةُ الإدارة الواحدة
          وتفرّقت في التقارير. صارت قائمةً مُعرَّفة: الاسم فريد، والتقارير تُجمَع
          عليه، ومن أراد إدارة جديدة أضافها هنا أوّلًا.
        </p>

        <DepartmentsEditor initial={rows} />

        <p className="tiny muted" style={{ marginTop: 14 }}>
          لا تُحذف إدارة. إدارةٌ حملت موظفًا يومًا هي جزء من سجلّ تدريبه، وحذفها
          يجعل تقارير الأمس تشير إلى لا شيء — فالتعطيل يُخرجها من قوائم الاختيار
          ويُبقي التاريخ كما كان.
        </p>
      </main>
    </>
  );
}
