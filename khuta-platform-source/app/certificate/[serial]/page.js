import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { GovStrip, PlatformBar } from '../../../components/Chrome';
import SignOutButton from '../../dashboard/SignOutButton';
import PrintButton from './PrintButton';
const db = require('../../../src/db');
const S = require('../../../lib/session');
const A = require('../../../lib/authz');

export const dynamic = 'force-dynamic';

/**
 * الشهادة كما تُطبع.
 *
 * التحقّق العام في /verify ولا يحتاج جلسة — فهو لمن يتحقّق لا لمن يملك.
 * أمّا هذه فللمالك نفسه أو لمسؤول جهته، لأنها تحمل الاسم كاملًا والدرجة،
 * ولأن رقم الشهادة ليس سرًّا يُحرس به شيء: من يعرفه لا يستحقّ بمعرفته
 * وحدها أن يرى ورقة باسم صاحبه.
 */
export default async function CertificatePage({ params }) {
  const user = await S.currentUser();
  if (!user) redirect('/signin');
  if (A.learnerDenial(user) === 'change-password') redirect('/account/password');

  const { serial } = await params;

  const cert = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows } = await c.query(`
      select ct.serial, ct.verify_code, ct.issued_to_name, ct.course_title,
             ct.score, ct.issued_at, ct.revoked_at, ct.revoked_reason,
             e.user_id, e.cohort,
             t.name_ar as tenant_name_ar
        from certificate ct
        join enrolment e on e.id = ct.enrolment_id
        join tenant t on t.id = ct.tenant_id
       where ct.serial = $1`, [decodeURIComponent(serial)]);
    return rows[0] || null;
  });

  if (!cert) notFound();
  if (cert.user_id !== user.id && !A.isAdmin(user)) notFound();

  const score = Math.round(Number(cert.score) * 100);
  const issued = new Date(cert.issued_at).toLocaleDateString('ar-AE', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <>
      <div className="noprint">
        <GovStrip />
        <PlatformBar user={user}><SignOutButton /></PlatformBar>
      </div>

      <main className="wrap" style={{ maxWidth: 900 }}>
        <div className="between noprint" style={{ marginBottom: 16 }}>
          <p className="tiny muted" style={{ margin: 0 }}>
            <Link href="/dashboard">لوحتي</Link> · الشهادة
          </p>
          <PrintButton />
        </div>

        {cert.revoked_at ? (
          <div className="alert" data-testid="revoked">
            <b>هذه الشهادة مُلغاة</b>
            {cert.revoked_reason ? ` — ${cert.revoked_reason}` : ''}. لا تُعتمد ولا تُطبع.
          </div>
        ) : null}

        <article className="sheet" data-testid="certificate">
          <header className="sheet-head">
            <img className="sheet-crest" src="/gov/al-ain-municipality.png" alt="" />
            <div>
              <div className="sheet-org">دائرة البلديات والنقل · بلدية مدينة العين</div>
              <div className="sheet-org en">
                DEPARTMENT OF MUNICIPALITIES AND TRANSPORT · AL AIN CITY MUNICIPALITY
              </div>
            </div>
          </header>

          <div className="sheet-rule" />

          <p className="sheet-kicker">{cert.tenant_name_ar} · أكاديمية التدريب البلدي</p>
          <h1 className="sheet-title">شهادة إتمام دورة</h1>

          <p className="sheet-lede">تشهد الأكاديمية بأنّ</p>
          <p className="sheet-name" data-testid="cert-name">{cert.issued_to_name}</p>
          <p className="sheet-lede">قد أتمّ بنجاح متطلّبات دورة</p>
          <p className="sheet-course">{cert.course_title}</p>

          <div className="sheet-facts">
            <div>
              <b className="num">{score}٪</b>
              <span>درجة التقييم البعدي</span>
            </div>
            <div>
              <b>{issued}</b>
              <span>تاريخ الإصدار</span>
            </div>
            {cert.cohort ? (
              <div>
                <b className="ltr">{cert.cohort}</b>
                <span>الدفعة</span>
              </div>
            ) : null}
          </div>

          <footer className="sheet-foot">
            <div>
              <span className="tiny">رقم الشهادة</span>
              <div className="serial ltr">{cert.serial}</div>
            </div>
            <div>
              <span className="tiny">رمز التحقّق</span>
              <div className="code ltr">{cert.verify_code}</div>
            </div>
          </footer>

          <p className="sheet-note">
            تُتحقَّق صحّة هذه الشهادة في أي وقت من
            {' '}<span className="ltr">khuta.b14facilities.com/verify</span>{' '}
            بإدخال رمز التحقّق أعلاه. الإلغاء يظهر للمتحقّق فور وقوعه.
          </p>
        </article>

        <p className="tiny muted noprint" style={{ marginTop: 14 }}>
          تُطبع على A4 أفقيًّا. ما يظهر على الورق هو الشهادة وحدها دون عناصر الموقع.
        </p>
      </main>
    </>
  );
}
