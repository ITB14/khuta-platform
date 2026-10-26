import { redirect } from 'next/navigation';
import Link from 'next/link';
import { GovStrip, PlatformBar, DemoBanner } from '../../../components/Chrome';
import SignOutButton from '../../dashboard/SignOutButton';
import Quiz from './Quiz';
import FinalQuiz from './FinalQuiz';
const S = require('../../../lib/session');
const AZ = require('../../../lib/authz');
const A = require('../../../lib/assess');

export const dynamic = 'force-dynamic';

// الأعداد تُقرأ من قاعدة البيانات لا تُكتب في النصّ، كي لا يكذب الشرح على
// المتعلّم إن تغيّر بنك الأسئلة.
const HEAD = {
  pre: { title: 'التقييم القبلي', lead: (n) =>
    `${n} سؤالًا قصيرًا قبل بدء الدورة، سؤال لكل كفاية. لا درجة نجاح لها ولا أثر على تقييمك — `
    + 'تُقاس بها معرفتك قبل التدريب لتُقارن بما بعده. ولا يُفتح الدرس الأول قبل أدائها.' },
  post: { title: 'التقييم البعدي', lead: (n) =>
    `${n} سؤالًا تغطّي كفايات الدورة كلها. ومعظمها يقابل أسئلة التقييم القبلي سؤالًا بسؤال، `
    + 'فيُقاس الفرق بينهما لا الدرجة وحدها.' },
  lesson: { title: 'اختبار الدرس', lead: (n) =>
    `${n} أسئلة على هذا الدرس وحده. اجتيازها هو ما يفتح الدرس التالي.` },
};

const OPEN_HEAD = {
  pre: { title: 'اعرف مستواك قبل أن تبدأ', lead: (n) =>
    `${n} سؤالًا سريعًا، سؤال لكل مهارة. اختياري تمامًا: لا يفتح شيئًا ولا يقفل شيئًا، `
    + 'ولا يراه أحد كدرجة. فائدته الوحيدة أن تقارن به معرفتك بعد الدورة.' },
  post: { title: 'اختبار الشهادة', lead: (n) =>
    `${n} سؤالًا، سؤال لكل مهارة من مهارات الدورة. ليس امتحانًا: كلّما أخطأت ظهر لك `
    + 'الصواب وشرحه وأعدت السؤال، بلا حدّ للمحاولات. ومتى أتممت الأسئلة صدرت شهادتك.' },
};

export default async function AssessmentPage({ params }) {
  const { slug } = await params;
  const user = await S.currentUser();
  if (!user) redirect('/signin');
  if (AZ.learnerDenial(user) === 'change-password') redirect('/account/password');

  const parsed = A.parseSlug(slug);
  if (!parsed) redirect('/dashboard');

  const a = await A.db.withTenant(user.tenant.id, user.id, (c) => A.findAssessment(c, user.id, slug));
  if (!a) redirect('/dashboard');

  // في النمط المفتوح لا «قبلي» بوّابةً ولا «بعدي» امتحانًا: الأول قياس اختياري،
  // والثاني اختبار الشهادة. فيتغيّر العنوان والشرح معهما.
  const open = a.mode === 'open';
  const head = open && OPEN_HEAD[a.kind] ? OPEN_HEAD[a.kind] : HEAD[a.kind];
  const title = a.kind === 'lesson' ? `اختبار الدرس ${a.lesson_no} — ${a.lesson_title}` : head.title;

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap">
        <p className="tiny" style={{ marginBottom: 6 }}>
          <Link href="/dashboard">الرئيسية</Link> · {a.course_title}
        </p>
        <h1>{title}</h1>
        <p className="muted" style={{ marginBottom: 18, maxWidth: 760 }}>{head.lead(a.total)}</p>

        <div className="kpi" style={{ marginBottom: 16 }}>
          <div><b className="num">{a.total}</b><span>عدد الأسئلة</span></div>
          {open && a.kind === 'post' ? (
            <>
              <div><b className="num">كلّها</b><span>المطلوب لإتمامه</span></div>
              <div><b className="num">بلا حدّ</b><span>المحاولات</span></div>
            </>
          ) : (
            <>
              <div><b className="num">{a.pass_mark ? `${Math.round(Number(a.pass_mark) * 100)}٪` : '—'}</b>
                   <span>درجة النجاح</span></div>
              <div><b className="num">{a.used} / {a.allowed}</b><span>المحاولات المستخدمة</span></div>
            </>
          )}
        </div>

        {!a.ok ? (
          <div className="card">
            <div className="alert" data-testid="gate">{A.REASONS[a.reason] || 'هذا التقييم غير متاح الآن.'}</div>
            <Link className="btn" href="/dashboard">العودة إلى الرئيسية</Link>
          </div>
        ) : open && a.kind === 'post' ? (
          <FinalQuiz slug={slug} total={a.total} />
        ) : (
          <Quiz slug={slug} total={a.total} kind={a.kind} />
        )}
      </main>
    </>
  );
}
