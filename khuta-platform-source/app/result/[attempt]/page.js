import { redirect } from 'next/navigation';
import Link from 'next/link';
import { GovStrip, PlatformBar, DemoBanner } from '../../../components/Chrome';
import SignOutButton from '../../dashboard/SignOutButton';
const S = require('../../../lib/session');
const AZ = require('../../../lib/authz');
const A = require('../../../lib/assess');

export const dynamic = 'force-dynamic';

const pc = (n) => `${Math.round(Number(n) * 100)}٪`;

export default async function ResultPage({ params }) {
  const { attempt } = await params;
  const user = await S.currentUser();
  if (!user) redirect('/signin');
  if (AZ.learnerDenial(user) === 'change-password') redirect('/account/password');

  const data = await A.db.withTenant(user.tenant.id, user.id, async (c) => {
    const a = await A.ownedAttempt(c, user.id, attempt);
    if (!a || !a.submitted_at) return null;

    const { rows: gain } = a.kind === 'post'
      ? await c.query(`select competency_code, competency, pre_ratio, post_ratio, gain
                         from learning_gain where enrolment_id = $1
                        order by gain desc, competency_code`, [a.enrolment_id])
      : { rows: [] };

    const { rows: cert } = await c.query(
      `select serial, verify_code, issued_at, revoked_at from certificate where enrolment_id = $1`,
      [a.enrolment_id]);

    const { rows: g } = await c.query(
      `select * from assessment_gate($1, (select assessment_id from attempt where id = $2))`,
      [a.enrolment_id, attempt]);

    return { a, gain, cert: cert[0] || null, gate: g[0] };
  });

  if (!data) redirect('/dashboard');
  const { a, gain, cert, gate } = data;
  const score = Number(a.score);
  const passed = a.passed;                              // null for the pre-assessment
  const retake = passed === false && gate && gate.used < gate.allowed;
  const slug = a.kind === 'lesson' ? `lesson-${a.lesson_no}` : a.kind;

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap">
        <p className="tiny" style={{ marginBottom: 6 }}>
          <Link href="/dashboard">الرئيسية</Link> · {a.course_title}
        </p>
        <h1>
          نتيجة {a.kind === 'pre' ? 'التقييم القبلي'
            : a.kind === 'post' ? 'التقييم البعدي' : `اختبار الدرس ${a.lesson_no}`}
        </h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          المحاولة {a.attempt_no} من {a.max_attempts} · صُحِّحت على الخادم
        </p>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="score">
            <span className={`big num${passed === null ? '' : passed ? ' ok' : ' no'}`}
                  data-testid="score">{pc(score)}</span>
            <div>
              <b>{a.kind === 'pre' ? 'سُجّلت إجاباتك'
                : passed ? 'اجتزت' : 'لم تجتز'}</b>
              <p className="tiny">
                {a.kind === 'pre'
                  ? 'لا درجة نجاح للتقييم القبلي. تُحفظ هذه النتيجة لتُقارن بالتقييم البعدي.'
                  : `درجة النجاح ${pc(a.pass_mark)}`}
              </p>
            </div>
          </div>
        </div>

        {a.kind === 'post' && gain.length ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 4 }}>مكسب التعلّم بحسب الكفاية</h3>
            <p className="tiny" style={{ marginBottom: 12 }}>
              يُحسب بمقارنة كل سؤال بعدي بالسؤال القبلي المقابل له في الكفاية نفسها، لا بمقارنة
              الدرجتين الإجماليتين.
            </p>
            <table className="gain" data-testid="gain">
              <thead><tr><th>الكفاية</th><th>قبل</th><th>بعد</th><th>الفرق</th></tr></thead>
              <tbody>
                {gain.map((g) => (
                  <tr key={g.competency_code}>
                    <td>{g.competency}</td>
                    <td className="num">{pc(g.pre_ratio)}</td>
                    <td className="num">{pc(g.post_ratio)}</td>
                    {/* isolated, or the sign jumps to the far side in RTL */}
                    <td className={`num ${Number(g.gain) > 0 ? 'up' : 'flat'}`}>
                      <span className="ltr">
                        {Number(g.gain) > 0 ? '+' : ''}{Math.round(Number(g.gain) * 100)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {cert && !cert.revoked_at ? (
          <div className="cert" style={{ marginBottom: 16 }} data-testid="certificate">
            <h3 style={{ marginBottom: 8 }}>صدرت شهادتك</h3>
            <p style={{ marginBottom: 10 }}>
              الرقم <span className="serial">{cert.serial}</span> · رمز التحقّق{' '}
              <span className="code">{cert.verify_code}</span>
            </p>
            <p className="tiny" style={{ marginBottom: 12 }}>
              يستطيع أي جهة التحقّق من الشهادة بإدخال الرمز في صفحة التحقّق. وإذا أُلغيت الشهادة
              لاحقًا ظهر الإلغاء للمتحقّق فورًا.
            </p>
            <Link className="btn gold" href={`/verify?code=${cert.verify_code}`}>صفحة التحقّق</Link>
          </div>
        ) : null}

        <div className="card">
          <div className="between">
            <p className="tiny" style={{ flex: 1, minWidth: 240 }}>
              {a.kind === 'pre' ? 'فُتح الدرس الأول. يبدأ المسار من الرئيسية.'
                : passed && a.kind === 'lesson' ? 'فُتح الدرس التالي.'
                : passed ? 'اكتمل المسار.'
                : retake ? 'تستطيع إعادة المحاولة؛ تُحتسب محاولة جديدة.'
                : 'استُنفدت المحاولات. راجع مسؤول التدريب في جهتك.'}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              {retake ? (
                <Link className="btn" href={`/assessment/${slug}`} data-testid="retake">إعادة المحاولة</Link>
              ) : null}
              <Link className="btn gold" href="/dashboard">الرئيسية</Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
