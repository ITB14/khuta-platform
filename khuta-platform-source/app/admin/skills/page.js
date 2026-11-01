import { redirect } from 'next/navigation';
import { GovStrip, PlatformBar, DemoBanner } from '../../../components/Chrome';
import Back from '../../../components/Back';
import SignOutButton from '../../dashboard/SignOutButton';
import SkillsEditor from './SkillsEditor';
const db = require('../../../src/db');
const S = require('../../../lib/session');
const A = require('../../../lib/authz');

export const dynamic = 'force-dynamic';

export default async function AdminSkills() {
  const user = await S.currentUser();
  const denial = A.adminDenial(user);
  if (denial === 'signin') redirect('/signin');
  if (denial) redirect('/dashboard');

  const rows = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows } = await c.query(`
      select d.*,
             (select coalesce(dep.name_ar, 'بلا إدارة')
                from skill_demand_by_department bd
                left join department dep on dep.id = bd.department_id
               where bd.skill_id = d.skill_id and bd.wants > 0
               order by bd.wants desc limit 1) as top_department,
             (select bd.wants from skill_demand_by_department bd
               where bd.skill_id = d.skill_id and bd.wants > 0
               order by bd.wants desc limit 1) as top_wants
        from skill_demand d
       order by d.wants desc, d.declared desc, d.name_ar`);
    return rows;
  });

  const totalWants = rows.reduce((a, r) => a + r.wants, 0);
  const declared = rows.reduce((a, r) => a + r.declared, 0);

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap" style={{ maxWidth: 1040 }}>
        <Back href="/admin" label="المتعلّمون" here="المهارات والطلب" />
        <h1>المهارات والطلب على التعلّم</h1>
        <p className="muted" style={{ marginBottom: 20, maxWidth: 800 }}>
          المنصة تحمل دورة واحدة وأربعًا موعودة، والسؤال الذي يسبق تصويرها:
          أيّها أولى؟ هذه الصفحة تجعل الجواب رقمًا بدل تخمين — كم موظفًا قال
          «أريد أن أتعلّم هذه»، وفي أيّ إدارة.
        </p>

        <div className="kpi" style={{ marginBottom: 18 }}>
          <div><b className="num">{rows.length}</b><span>مهارة في الكتالوج</span></div>
          <div><b className="num">{declared}</b><span>إعلانات الموظفين</span></div>
          <div><b className="num">{totalWants}</b><span>طلبات تعلّم</span></div>
        </div>

        <SkillsEditor initial={rows} />

        <p className="tiny muted" style={{ marginTop: 14 }}>
          الترتيب بالطلب: أعلى الصفحة ما يريده أكثر الناس. و«أكثر إدارة تطلبها»
          تفرّق بين مهارة يريدها عشرون في إدارة واحدة — فتُدرَّب دفعةً — ومهارة
          يريدها عشرون متفرّقون. ولا تُحذف مهارة أعلنها موظف: التعطيل يُخرجها من
          قائمة الإضافة ويُبقي ما أُعلن.
        </p>
      </main>
    </>
  );
}
