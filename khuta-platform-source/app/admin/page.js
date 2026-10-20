import { redirect } from 'next/navigation';
import Link from 'next/link';
import { GovStrip, PlatformBar, DemoBanner } from '../../components/Chrome';
import SignOutButton from '../dashboard/SignOutButton';
const db = require('../../src/db');
const S = require('../../lib/session');
const A = require('../../lib/authz');

export const dynamic = 'force-dynamic';

async function roster(tenantId, actorId) {
  return db.withTenant(tenantId, actorId, async (c) => {
    // صفّ لكل تسجيل لا لكل متعلّم: من سُجّل في دورتين يظهر مرّتين، وهذا ما
    // يريده المسؤول — الحالة لكل دورة لا مجموعًا مبهمًا.
    const { rows } = await c.query(`
      select u.id, u.full_name_ar, u.email, u.department, u.status,
             e.id as enrolment_id, e.cohort, e.state, e.due_at,
             co.title_ar as course_title,
             (select count(*) from lesson l where l.course_id = co.id)::int as lessons,
             (select count(*) from lesson_progress lp
                join lesson l2 on l2.id = lp.lesson_id
               where l2.course_id = co.id and lp.enrolment_id = e.id
                 and lp.completed_at is not null)::int as done,
             (select max(a.score) from attempt a
                join assessment s on s.id = a.assessment_id
               where a.enrolment_id = e.id and s.kind = 'pre'
                 and a.submitted_at is not null) as pre_score,
             (select max(a.score) from attempt a
                join assessment s on s.id = a.assessment_id
               where a.enrolment_id = e.id and s.kind = 'post'
                 and a.submitted_at is not null) as post_score,
             (select ct.serial from certificate ct
               where ct.enrolment_id = e.id and ct.revoked_at is null
               order by ct.issued_at desc limit 1) as cert_serial
        from app_user u
        join user_role_grant g on g.user_id = u.id and g.role = 'learner'
        left join enrolment e on e.user_id = u.id
        left join course co on co.id = e.course_id
       order by u.full_name_ar, co.title_ar`);
    return rows;
  });
}

const pct = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 100));

export default async function AdminHome() {
  const user = await S.currentUser();
  const denial = A.adminDenial(user);
  if (denial === 'signin') redirect('/signin');
  if (denial) redirect('/dashboard');

  const rows = await roster(user.tenant.id, user.id);

  const started = rows.filter((r) => r.pre_score !== null).length;
  const finished = rows.filter((r) => r.cert_serial).length;
  const gains = rows
    .filter((r) => r.pre_score !== null && r.post_score !== null)
    .map((r) => Number(r.post_score) - Number(r.pre_score));
  const avgGain = gains.length
    ? Math.round((gains.reduce((a, b) => a + b, 0) / gains.length) * 100)
    : null;

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap">
        <div className="between" style={{ marginBottom: 6 }}>
          <h1>المتعلّمون</h1>
          <Link className="btn gold" href="/admin/new" data-testid="add-learner">إضافة متعلّم</Link>
        </div>
        <p className="muted" style={{ marginBottom: 20 }}>
          حالة كل متعلّم في جهتك. الدرجات كما احتسبها الخادم، لا كما أرسلها المتصفّح.
        </p>

        <div className="kpi" style={{ marginBottom: 18 }}>
          <div><b className="num">{rows.length}</b><span>تسجيلات</span></div>
          <div><b className="num">{started}</b><span>بدأوا المسار</span></div>
          <div><b className="num">{finished}</b><span>أنهوا بشهادة</span></div>
          <div>
            <b className="num">{avgGain === null ? '—' : `${avgGain > 0 ? '+' : ''}${avgGain}٪`}</b>
            <span>متوسّط مكسب التعلّم</span>
          </div>
        </div>

        <div className="card">
          {rows.length === 0 ? (
            <p>لا يوجد متعلّمون بعد. ابدأ بـ<Link href="/admin/new"> إضافة متعلّم</Link>.</p>
          ) : (
            <table className="gain" data-testid="roster">
              <thead>
                <tr>
                  <th>المتعلّم</th>
                  <th>الإدارة</th>
                  <th>الدورة</th>
                  <th>الدروس</th>
                  <th>قبلي</th>
                  <th>بعدي</th>
                  <th>المكسب</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pre = pct(r.pre_score);
                  const post = pct(r.post_score);
                  const gain = pre !== null && post !== null ? post - pre : null;
                  return (
                    <tr key={`${r.id}-${r.enrolment_id || 'none'}`}>
                      <td>
                        <b>{r.full_name_ar}</b>
                        <div className="tiny ltr muted">{r.email}</div>
                      </td>
                      <td>{r.department || '—'}</td>
                      <td>
                        {r.course_title || <span className="muted">غير مسجَّل</span>}
                        {r.cohort ? <div className="tiny muted">{r.cohort}</div> : null}
                      </td>
                      <td className="num">
                        {r.enrolment_id ? `${r.done} / ${r.lessons}` : '—'}
                      </td>
                      <td className="num">{pre === null ? '—' : `${pre}٪`}</td>
                      <td className="num">{post === null ? '—' : `${post}٪`}</td>
                      <td className={`num ${gain > 0 ? 'up' : 'flat'}`}>
                        {gain === null ? '—' : `${gain > 0 ? '+' : ''}${gain}٪`}
                      </td>
                      <td>
                        {r.cert_serial ? (
                          <span className="pill ok">شهادة {r.cert_serial}</span>
                        ) : r.enrolment_id && r.done === r.lessons && r.lessons > 0 ? (
                          <span className="pill gold">بانتظار التقييم البعدي</span>
                        ) : pre !== null ? (
                          <span className="pill gold">قيد التقدّم</span>
                        ) : (
                          <span className="pill">لم يبدأ</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="tiny muted" style={{ marginTop: 14 }}>
          المكسب هو فرق التقييم البعدي عن القبلي لمن أدّى الاثنين. ولا يظهر هنا إلا
          متعلّمو جهتك — العزل تفرضه قاعدة البيانات لا هذه الصفحة.
        </p>
      </main>
    </>
  );
}
