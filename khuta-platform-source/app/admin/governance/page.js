import { redirect } from 'next/navigation';
import { GovStrip, PlatformBar, DemoBanner } from '../../../components/Chrome';
import Back from '../../../components/Back';
import SignOutButton from '../../dashboard/SignOutButton';
import GovernanceActions from './GovernanceActions';
const db = require('../../../src/db');
const S = require('../../../lib/session');
const A = require('../../../lib/authz');

export const dynamic = 'force-dynamic';

const RESULT_AR = { valid: 'سارية', revoked: 'مُلغاة', not_found: 'رمز لا يُطابق' };

export default async function Governance() {
  const user = await S.currentUser();
  const denial = A.adminDenial(user);
  if (denial === 'signin') redirect('/signin');
  if (denial) redirect('/dashboard');

  const data = await db.withTenant(user.tenant.id, user.id, async (c) => {
    // لا مُجدوِل في المنصة، فاللقطة تُؤخذ عند النظر — كما تُشتقّ الإشعارات.
    // وهذا يضمن أنّ كل شهرٍ نظر فيه أحدٌ إلى الصفحة له رقمٌ محفوظ.
    await c.query('select take_compliance_snapshot()');

    const { rows: periods } = await c.query(`
      select period,
             sum(enrolments)::int      as enrolments,
             sum(certified_count)::int as certified,
             sum(overdue_count)::int   as overdue,
             sum(measured_count)::int  as measured,
             case when sum(measured_count) > 0
                  then round(sum(avg_gain::numeric * measured_count)
                             / sum(measured_count))::int end as avg_gain,
             max(generated_at) as generated_at
        from compliance_snapshot group by period order by period desc limit 24`);

    const { rows: verifs } = await c.query(`
      select v.result, v.code_tried, v.checked_at, c.serial
        from verification_log v
        left join certificate c on c.id = v.certificate_id
       order by v.checked_at desc limit 25`);

    const { rows: counts } = await c.query(`
      select result, count(*)::int n from verification_log group by result`);

    const { rows: rules } = await c.query(`
      select entity_name, retain_months, legal_basis, is_active,
             last_run_at, last_run_rows,
             retention_due(entity_name) as due
        from retention_rule order by entity_name`);

    return { periods, verifs, counts, rules };
  });

  const byResult = Object.fromEntries(data.counts.map((r) => [r.result, r.n]));

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap" style={{ maxWidth: 1040 }}>
        <Back href="/admin" label="المتعلّمون" here="السجلّ والحوكمة" />
        <h1>السجلّ والحوكمة</h1>
        <p className="muted" style={{ marginBottom: 20, maxWidth: 820 }}>
          ثلاثة أشياء يجمعها أنّ ما يُفقد منها بالتأخير لا يُستردّ: تحقّقٌ لم
          يُسجَّل، وشهرٌ مضى بلا رقم، ونبضاتٌ تتراكم بلا قاعدة.
        </p>

        {/* ------------------------------------------------ لقطة الامتثال */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="between" style={{ marginBottom: 10 }}>
            <h3>الخطّ الزمني للامتثال</h3>
            <span className="tiny muted">{data.periods.length} شهرًا مسجَّلًا</span>
          </div>
          <p className="tiny" style={{ marginBottom: 12 }}>
            لوحة التحليلات تقول «الآن»؛ هذا الجدول يقول «كيف كان». واللقطة
            تُؤخذ عند فتح هذه الصفحة لأن المنصة بلا مُجدوِل — فشهرٌ لم يفتحها
            فيه أحدٌ لا سطر له. وهو نقصٌ مُعلَن، يزول بمُجدوِل خارجي ينادي
            الدالّة مرّةً في الشهر.
          </p>
          {data.periods.length === 0 ? (
            <p className="muted">لا لقطات بعد.</p>
          ) : (
            <table className="gain" data-testid="periods">
              <thead>
                <tr><th>الشهر</th><th>تسجيلات</th><th>شهادات</th><th>متأخّرون</th>
                    <th>الإنجاز</th><th>المكسب</th></tr>
              </thead>
              <tbody>
                {data.periods.map((p) => (
                  <tr key={p.period}>
                    <td><b className="ltr">{p.period}</b></td>
                    <td className="num">{p.enrolments}</td>
                    <td className="num">{p.certified}</td>
                    <td className={`num${p.overdue > 0 ? ' no' : ''}`}>{p.overdue || '—'}</td>
                    <td className="num">
                      {p.enrolments ? `${Math.round((p.certified / p.enrolments) * 100)}٪` : '—'}
                    </td>
                    <td className={`num ${p.avg_gain > 0 ? 'up' : 'flat'}`}>
                      {p.avg_gain === null ? '—' : `${p.avg_gain > 0 ? '+' : ''}${p.avg_gain}٪`}
                      {p.measured ? <span className="tiny muted"> ({p.measured})</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ------------------------------------------------- سجل التحقّق */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 10 }}>سجل التحقّق من الشهادات</h3>
          <div className="kpi" style={{ marginBottom: 12 }}>
            <div><b className="num">{byResult.valid || 0}</b><span>تحقّق من سارية</span></div>
            <div><b className="num">{byResult.revoked || 0}</b><span>من مُلغاة</span></div>
            <div>
              <b className={`num${byResult.not_found ? ' no' : ''}`}>{byResult.not_found || 0}</b>
              <span>رمز لا يُطابق</span>
            </div>
          </div>
          <p className="tiny" style={{ marginBottom: 12 }}>
            شهادةٌ يتحقّق منها أحدٌ دون أن يبقى لذلك أثر ليست شهادةً مُدقَّقة.
            والعنوان لا يُحفظ — تُحفظ بصمةٌ منه تكفي لتمييز المتكرّر ولا
            تُعرّف شخصًا. وتكرارُ «رمز لا يُطابق» هو شكل التحسّس حين يقع.
          </p>
          {data.verifs.length === 0 ? (
            <p className="muted">لا عمليات تحقّق بعد.</p>
          ) : (
            <table className="gain" data-testid="verifications">
              <thead><tr><th>الوقت</th><th>النتيجة</th><th>الشهادة</th><th>الرمز المُدخَل</th></tr></thead>
              <tbody>
                {data.verifs.map((v, i) => (
                  <tr key={i}>
                    <td className="tiny">{new Date(v.checked_at).toLocaleString('ar-AE')}</td>
                    <td>
                      <span className={`pill${v.result === 'valid' ? ' ok'
                        : v.result === 'revoked' ? ' gold' : ''}`}>
                        {RESULT_AR[v.result]}
                      </span>
                    </td>
                    <td>{v.serial ? <span className="ltr">{v.serial}</span> : '—'}</td>
                    <td className="tiny"><span className="ltr">{v.code_tried}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* --------------------------------------------- قاعدة الاحتفاظ */}
        <GovernanceActions rules={data.rules} />

        <p className="tiny muted" style={{ marginTop: 14 }}>
          النبضة دليلٌ تفصيليّ على المشاهدة؛ أمّا ما تُدافَع به الشهادة —
          الثواني المحتسَبة وأقصى موضع بلغه المتعلّم ووقت الإتمام — فمحفوظٌ في
          تقدّم الدرس ولا تمسّه قاعدة الاحتفاظ. فحذف النبضة القديمة يُسقط
          التفصيل لا الحُجّة.
        </p>
      </main>
    </>
  );
}
