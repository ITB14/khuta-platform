import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { GovStrip, PlatformBar, DemoBanner } from '../../../../components/Chrome';
import SignOutButton from '../../../dashboard/SignOutButton';
import EditLearnerForm from './EditLearnerForm';
const db = require('../../../../src/db');
const S = require('../../../../lib/session');
const A = require('../../../../lib/authz');

export const dynamic = 'force-dynamic';

export default async function EditLearner({ params }) {
  const user = await S.currentUser();
  const denial = A.adminDenial(user);
  if (denial === 'signin') redirect('/signin');
  if (denial) redirect('/dashboard');

  const { id } = await params;

  const data = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows } = await c.query(`
      select u.id, u.email, u.full_name_ar, u.employee_no, u.department,
             u.job_title, u.status, u.created_at,
             coalesce(cr.must_change, false) as must_change,
             exists (select 1 from user_role_grant g
                      where g.user_id = u.id and g.role <> 'learner') as privileged
        from app_user u
        left join user_credential cr on cr.user_id = u.id
       where u.id = $1`, [id]);
    if (!rows[0]) return null;

    const { rows: enrol } = await c.query(`
      select co.title_ar, e.cohort, e.state, e.due_at,
             (select count(*) from lesson l where l.course_id = co.id)::int as lessons,
             (select count(*) from lesson_progress lp
                join lesson l2 on l2.id = lp.lesson_id
               where l2.course_id = co.id and lp.enrolment_id = e.id
                 and lp.completed_at is not null)::int as done
        from enrolment e join course co on co.id = e.course_id
       where e.user_id = $1 order by e.due_at nulls last`, [id]);
    return { learner: rows[0], enrol };
  });

  if (!data) notFound();
  const { learner, enrol } = data;

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap" style={{ maxWidth: 820 }}>
        <p className="tiny muted" style={{ marginBottom: 4 }}>
          <Link href="/admin">المتعلّمون</Link> · {learner.full_name_ar}
        </p>
        <h1>{learner.full_name_ar}</h1>
        <p className="muted ltr" style={{ marginBottom: 20 }}>{learner.email}</p>

        {learner.privileged ? (
          <div className="alert" data-testid="privileged">
            هذا الحساب يحمل دورًا إداريًّا، ولا يُعدَّل ولا يُوقَف من هذه الشاشة.
            إدارة الأدوار تمرّ بـ<span className="ltr"> scripts/grant_role.js</span>.
          </div>
        ) : (
          <EditLearnerForm learner={learner} />
        )}

        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 10 }}>التسجيلات</h3>
          {enrol.length === 0 ? (
            <p className="tiny muted" style={{ margin: 0 }}>غير مسجَّل في أي دورة.</p>
          ) : enrol.map((e, i) => (
            <div key={i} className="between" style={{ padding: '8px 0' }}>
              <div>
                <b>{e.title_ar}</b>
                <div className="tiny muted">
                  {e.cohort || '—'}
                  {e.due_at ? ` · الموعد ${new Date(e.due_at).toLocaleDateString('ar-AE')}` : ''}
                </div>
              </div>
              <span className="pill gold num">{e.done} من {e.lessons} دروس</span>
            </div>
          ))}
          {learner.must_change ? (
            <p className="tiny muted" style={{ marginTop: 10 }}>
              على كلمة مرور مؤقّتة — يُطلب منه تغييرها عند الدخول.
            </p>
          ) : null}
        </div>
      </main>
    </>
  );
}
