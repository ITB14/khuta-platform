import { redirect } from 'next/navigation';
import Link from 'next/link';
import { GovStrip, PlatformBar, DemoBanner } from '../../components/Chrome';
import SignOutButton from '../dashboard/SignOutButton';
import SkillsPicker from './SkillsPicker';
const db = require('../../src/db');
const S = require('../../lib/session');
const A = require('../../lib/authz');

export const dynamic = 'force-dynamic';

export default async function Profile() {
  const user = await S.currentUser();
  if (!user) redirect('/signin');
  if (A.learnerDenial(user) === 'change-password') redirect('/account/password');

  const { skills, mine, me } = await db.withTenant(user.tenant.id, user.id, async (c) => {
    // الجلسة لا تحمل الإدارة، فتُقرأ هنا بدل أن يَعِد السطر بما لا يَظهر.
    const { rows: who } = await c.query(
      'select department, job_title, employee_no from app_user where id = $1', [user.id]);
    const { rows: skills } = await c.query(
      `select id, name_ar, category from skill where is_active order by category nulls last, name_ar`);
    // المعطّلة تظهر لمن سبق أن أعلنها: إعلانه لا يُحذف بتعطيل الكتالوج.
    const { rows: mine } = await c.query(`
      select us.skill_id, us.stance, s.name_ar, s.category, s.is_active
        from user_skill us join skill s on s.id = us.skill_id
       where us.user_id = $1 order by s.name_ar`, [user.id]);
    return { skills, mine, me: who[0] || {} };
  });

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap" style={{ maxWidth: 860 }}>
        <p className="tiny muted" style={{ marginBottom: 4 }}>
          <Link href="/dashboard">الرئيسية</Link> · ملفّي
        </p>
        <h1>{user.full_name_ar}</h1>
        <p className="muted" style={{ marginBottom: 20, maxWidth: 740 }}>
          {[me.job_title, me.department, me.employee_no].filter(Boolean).join(' · ')}
          {[me.job_title, me.department, me.employee_no].some(Boolean) ? ' · ' : ''}
          <span className="ltr">{user.email}</span>
        </p>

        <div className="note" style={{ marginBottom: 16 }}>
          هذا إعلانٌ منك لا اختبارٌ عليك: لا تُقاس به ولا تُحاسَب عليه. وفائدته
          أن تعرف جهتُك أيّ المهارات يريد موظفوها تعلّمها، فتُصوَّر الدورة
          القادمة على ما يُطلب فعلًا لا على ما يُظنّ.
        </div>

        {skills.length === 0 && mine.length === 0 ? (
          <div className="card">
            <p className="muted">لم يُضَف كتالوج المهارات بعد في جهتك.</p>
          </div>
        ) : (
          <SkillsPicker skills={skills} mine={mine} />
        )}
      </main>
    </>
  );
}
