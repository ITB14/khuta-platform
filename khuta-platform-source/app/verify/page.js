import { GovStrip } from '../../components/Chrome';
const db = require('../../src/db');

export const dynamic = 'force-dynamic';

// Public on purpose: a certificate nobody outside the platform can check is
// not a credential. No session, and nothing is returned but what a verifier
// needs — never an email, a department or a list of attempts.
export default async function VerifyPage({ searchParams }) {
  const { code } = await searchParams;
  let r = null;
  if (code) {
    const { rows } = await db.pool.query('select * from verify_certificate($1)', [String(code)]);
    r = rows[0] || { found: false };
  }

  return (
    <>
      <GovStrip />
      <main className="wrap" style={{ maxWidth: 680 }}>
        <h1>التحقّق من شهادة</h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          أدخل رمز التحقّق المطبوع على الشهادة. النتيجة تُقرأ من السجلّ مباشرة في لحظة الطلب.
        </p>

        <form className="card" method="get" style={{ marginBottom: 16 }}>
          <label className="field">
            <span>رمز التحقّق</span>
            <input name="code" defaultValue={code || ''} placeholder="A7K2-9QX4"
                   className="code" autoComplete="off" data-testid="code" />
          </label>
          <button className="btn gold block" data-testid="check">تحقّق</button>
        </form>

        {r && !r.found ? (
          <div className="card"><div className="alert" data-testid="not-found">
            لا توجد شهادة بهذا الرمز.
          </div></div>
        ) : null}

        {r && r.found ? (
          <div className="card" data-testid="result">
            {r.revoked ? (
              <div className="alert" data-testid="revoked">
                <b>هذه الشهادة مُلغاة.</b>{r.revoked_reason ? ` السبب: ${r.revoked_reason}` : ''}
              </div>
            ) : (
              <div className="note" style={{ marginBottom: 14 }} data-testid="valid">
                <b>الشهادة سارية.</b>
              </div>
            )}
            <table className="gain">
              <tbody>
                <tr><th>الاسم</th><td>{r.issued_to_name}</td></tr>
                <tr><th>الدورة</th><td>{r.course_title}</td></tr>
                <tr><th>الجهة</th><td>{r.tenant_name_ar}</td></tr>
                <tr><th>الدرجة</th><td className="num">{Math.round(Number(r.score) * 100)}٪</td></tr>
                <tr><th>رقم الشهادة</th><td><span className="ltr">{r.serial}</span></td></tr>
                <tr><th>تاريخ الإصدار</th>
                    <td>{new Date(r.issued_at).toLocaleDateString('ar-AE')}</td></tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </main>
    </>
  );
}
