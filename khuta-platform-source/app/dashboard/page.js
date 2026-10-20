import { redirect } from 'next/navigation';
import { GovStrip, PlatformBar, DemoBanner } from '../../components/Chrome';
import Link from 'next/link';
import SignOutButton from './SignOutButton';
const db = require('../../src/db');
const S = require('../../lib/session');
const A = require('../../lib/authz');

export const dynamic = 'force-dynamic';

async function learnerView(tenantId, userId) {
  return db.withTenant(tenantId, userId, async (c) => {
    const { rows: courses } = await c.query(`
      select co.id, co.title_ar, e.id as enrolment_id, e.state, e.due_at, e.cohort,
             (select count(*) from lesson l where l.course_id = co.id)::int as lessons,
             (select count(*) from lesson_progress lp
                join lesson l2 on l2.id = lp.lesson_id
               where l2.course_id = co.id and lp.enrolment_id = e.id
                 and lp.completed_at is not null)::int as done,
             exists (select 1 from attempt a
                       join assessment asm on asm.id = a.assessment_id
                      where a.enrolment_id = e.id and asm.kind = 'pre'
                        and a.submitted_at is not null) as pre_done
        from enrolment e
        join course co on co.id = e.course_id
       where e.user_id = $1
       order by e.due_at nulls last`, [userId]);

    // Each lesson carries its own quiz state, because under R4 the quiz — not
    // the video — is what opens the lesson after it.
    const { rows: lessons } = courses.length ? await c.query(`
      select l.no, l.title_ar, l.end_sec - l.start_sec as secs,
             lp.completed_at is not null as done, lp.unlocked_at is not null as unlocked,
             lesson_quiz_passed($1, l.id) as quiz_passed,
             g.ok as quiz_open, g.reason as quiz_reason, g.used as quiz_used, g.allowed as quiz_allowed
        from lesson l
        left join lesson_progress lp on lp.lesson_id = l.id and lp.enrolment_id = $1
        join assessment qa on qa.lesson_id = l.id
        cross join lateral assessment_gate($1, qa.id) g
       where l.course_id = $2 order by l.no`, [courses[0].enrolment_id, courses[0].id]) : { rows: [] };

    // The same gate function the assessment page uses, so the dashboard can
    // never invite a learner into a paper the server would refuse to open.
    const { rows: gates } = courses.length ? await c.query(`
      select a.kind, g.ok, g.reason, g.used, g.allowed,
             (select count(*) from question q where q.assessment_id = a.id)::int as n,
             (select max(at.score) from attempt at
               where at.enrolment_id = $1 and at.assessment_id = a.id and at.submitted_at is not null) as best
        from assessment a cross join lateral assessment_gate($1, a.id) g
       where a.course_id = $2 and a.kind in ('pre','post')`,
      [courses[0].enrolment_id, courses[0].id]) : { rows: [] };

    const { rows: cert } = await c.query(`
      select serial, verify_code, issued_at, revoked_at from certificate
       where enrolment_id = any($1::uuid[])`, [courses.map((x) => x.enrolment_id)]);

    return { courses, lessons, cert, gates: Object.fromEntries(gates.map((g) => [g.kind, g])) };
  });
}

export default async function Dashboard() {
  const user = await S.currentUser();
  if (!user) redirect('/signin');
  const { courses, lessons, cert, gates } = await learnerView(user.tenant.id, user.id);
  const c0 = courses[0];
  const live = cert.find((x) => !x.revoked_at);

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}>
        {A.isAdmin(user) ? (
          <Link className="linkbtn" href="/admin" data-testid="to-admin">المتعلّمون</Link>
        ) : null}
        <SignOutButton />
      </PlatformBar>

      <main className="wrap">
        <h1>أهلًا، {user.full_name_ar}</h1>
        <p className="muted" style={{ marginBottom: 20 }}>هذه دوراتك المطلوبة وحالة كلٍّ منها.</p>

        {!c0 ? (
          <div className="card"><p>لا توجد دورات مُسندة إليك بعد.</p></div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="between">
                <h2>{c0.title_ar}</h2>
                <span className={`pill ${c0.done === c0.lessons ? 'ok' : 'gold'}`}>
                  {c0.done} من {c0.lessons} دروس
                </span>
              </div>
              <div className="bar"><i style={{ width: `${Math.round((c0.done / c0.lessons) * 100)}%` }} /></div>
              {!c0.pre_done ? (
                <div className="note" style={{ marginTop: 14 }}>
                  <p style={{ marginBottom: 10 }}>
                    يبدأ المسار بتقييم قبلي قصير. لا درجة نجاح له — يُستخدم لقياس أثر التدريب عليك
                    بعد إتمام الدورة، ولا يُفتح أي درس قبل أدائه.
                  </p>
                  <Link className="btn gold" href="/assessment/pre" data-testid="start-pre">
                    ابدأ التقييم القبلي
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div className="between" style={{ marginBottom: 10 }}>
                <h3>التقييم البعدي</h3>
                <span className={`pill${gates.post?.ok ? ' gold' : gates.post?.reason === 'already_passed' ? ' ok' : ''}`}>
                  {gates.post?.reason === 'already_passed' ? 'مجتاز'
                    : gates.post?.ok ? 'متاح' : 'مقفل'}
                </span>
              </div>
              <p className="tiny" style={{ marginBottom: gates.post?.ok ? 12 : 0 }}>
                {gates.post?.reason === 'already_passed'
                  ? `اجتزته بدرجة ${Math.round(Number(gates.post.best) * 100)}٪.`
                  : gates.post?.ok
                    ? `${gates.post.n} سؤالًا. درجة النجاح ٧٠٪ والمحاولات ${gates.post.used} من ${gates.post.allowed}.`
                    : `يُفتح بعد إكمال الدروس ${lessons.length} واجتياز اختباراتها. ومعظم أسئلته تُقابل أسئلة التقييم القبلي سؤالًا بسؤال.`}
              </p>
              {gates.post?.ok ? (
                <Link className="btn gold" href="/assessment/post" data-testid="start-post">
                  ابدأ التقييم البعدي
                </Link>
              ) : null}
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12 }}>الدروس</h3>
              {lessons.map((l) => (
                <div key={l.no} className={`lesson${l.unlocked ? '' : ' locked'}`}>
                  <div className="n">{l.no}</div>
                  <div className="t">
                    {l.unlocked
                      ? <Link href={`/lesson/${l.no}`}><b>{l.title_ar}</b></Link>
                      : <b>{l.title_ar}</b>}
                    <span className="tiny">
                      {Math.round(l.secs / 60)} دقائق
                      {l.quiz_passed ? ' · اختبار الدرس مجتاز'
                        : l.quiz_open ? ` · اختبار الدرس متاح (${l.quiz_used} من ${l.quiz_allowed} محاولات)`
                        : l.done ? ' · استُنفدت محاولات اختبار الدرس' : ''}
                    </span>
                  </div>
                  {l.quiz_open ? (
                    <Link className="btn gold" href={`/assessment/lesson-${l.no}`}
                          data-testid={`quiz-${l.no}`}>اختبار الدرس</Link>
                  ) : null}
                  <span className={`pill${l.quiz_passed ? ' ok' : l.done ? ' gold' : ''}`}>
                    {l.quiz_passed ? 'مجتاز' : l.done ? 'بانتظار الاختبار'
                      : l.unlocked ? 'متاح' : 'مقفل'}
                  </span>
                </div>
              ))}
              <p className="tiny" style={{ marginTop: 12 }}>
                لا يُحتسب الدرس مكتملًا قبل مشاهدة ٩٥٪ منه، ولا يُفتح الدرس التالي قبل اجتياز
                اختبار سابقه.
              </p>
            </div>

            {live ? (
              <div className="cert" style={{ marginBottom: 16 }} data-testid="cert-card">
                <h3 style={{ marginBottom: 8 }}>شهادتك</h3>
                <p style={{ marginBottom: 10 }}>
                  الرقم <span className="serial">{live.serial}</span> · رمز التحقّق{' '}
                  <span className="code">{live.verify_code}</span>
                </p>
                <Link className="btn gold" href={`/verify?code=${live.verify_code}`}>صفحة التحقّق</Link>
              </div>
            ) : null}

            <div className="kpi">
              <div><b>{c0.cohort || '—'}</b><span>الدفعة</span></div>
              <div><b>{c0.due_at ? new Date(c0.due_at).toLocaleDateString('ar-AE') : '—'}</b><span>الموعد النهائي</span></div>
              <div><b>{cert.filter((x) => !x.revoked_at).length}</b><span>شهادات سارية</span></div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
