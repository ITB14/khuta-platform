import { redirect } from 'next/navigation';
import Link from 'next/link';
import { GovStrip, PlatformBar, DemoBanner } from '../../../components/Chrome';
import SignOutButton from '../../dashboard/SignOutButton';
import ImportForm from './ImportForm';
const db = require('../../../src/db');
const S = require('../../../lib/session');
const A = require('../../../lib/authz');

export const dynamic = 'force-dynamic';

export default async function ImportLearners() {
  const user = await S.currentUser();
  const denial = A.adminDenial(user);
  if (denial === 'signin') redirect('/signin');
  if (denial) redirect('/dashboard');

  const courses = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows } = await c.query('select code, title_ar from course order by title_ar');
    return rows;
  });

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap" style={{ maxWidth: 900 }}>
        <p className="tiny muted" style={{ marginBottom: 4 }}>
          <Link href="/admin">المتعلّمون</Link> · استيراد دفعة
        </p>
        <h1>استيراد دفعة من ملف</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          كل صفّ متعلّم. ما ينجح يُنشأ وما يفشل يُذكر بسطره وسببه — صفّ خاطئ
          لا يُبطل الباقي.
        </p>

        {courses.length === 0 ? (
          <div className="card"><p>لا توجد دورات في هذه الجهة بعد.</p></div>
        ) : (
          <ImportForm courses={courses} />
        )}
      </main>
    </>
  );
}
