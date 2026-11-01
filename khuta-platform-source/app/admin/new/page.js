import { redirect } from 'next/navigation';
import { GovStrip, PlatformBar, DemoBanner } from '../../../components/Chrome';
import Back from '../../../components/Back';
import SignOutButton from '../../dashboard/SignOutButton';
import NewLearnerForm from './NewLearnerForm';
const db = require('../../../src/db');
const S = require('../../../lib/session');
const A = require('../../../lib/authz');

export const dynamic = 'force-dynamic';

export default async function NewLearner() {
  const user = await S.currentUser();
  const denial = A.adminDenial(user);
  if (denial === 'signin') redirect('/signin');
  if (denial) redirect('/dashboard');

  const { courses, departments } = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows: courses } = await c.query('select code, title_ar from course order by title_ar');
    const { rows: departments } = await c.query(
      `select id, name_ar from department where is_active order by name_ar`);
    return { courses, departments };
  });

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap">
        <Back href="/admin" label="المتعلّمون" here="إضافة" />
        <h1>إضافة متعلّم</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          يُنشأ الحساب ويُسجَّل في الدورة، فتُفتح له دروسها كلّها ويبدأ متى شاء.
        </p>

        {courses.length === 0 ? (
          <div className="card"><p>لا توجد دورات في هذه الجهة بعد.</p></div>
        ) : (
          <NewLearnerForm courses={courses} departments={departments} />
        )}
      </main>
    </>
  );
}
