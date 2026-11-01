import { redirect } from 'next/navigation';
import { GovStrip, PlatformBar, DemoBanner } from '../../../components/Chrome';
import Back from '../../../components/Back';
import SignOutButton from '../../dashboard/SignOutButton';
const db = require('../../../src/db');
const S = require('../../../lib/session');
const A = require('../../../lib/authz');

export const dynamic = 'force-dynamic';

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

export default async function Analytics() {
  const user = await S.currentUser();
  const denial = A.adminDenial(user);
  if (denial === 'signin') redirect('/signin');
  if (denial) redirect('/dashboard');

  const rows = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows } = await c.query(`
      select p.*, coalesce(d.name_ar, 'بلا إدارة') as name_ar,
             d.id is null as unassigned, coalesce(d.is_active, true) as is_active
        from department_progress p
        left join department d on d.id = p.department_id
       order by p.certified::numeric / nullif(p.enrolments, 0) nulls last,
                p.enrolments desc`);
    return rows;
  });

  const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const total = sum('enrolments');
  const certified = sum('certified');
  const overdue = sum('overdue');
  const watched = sum('watched');
  const measured = sum('measured');
  // المتوسّط موزون بعدد المقيسين لا متوسّط المتوسّطات: إدارة بمقيس واحد لا
  // تزن كإدارة بمئة.
  const gain = measured > 0
    ? Math.round(rows.reduce((a, r) => a + (r.avg_gain || 0) * (r.measured || 0), 0) / measured)
    : null;

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap" style={{ maxWidth: 1060 }}>
        <Back href="/admin" label="المتعلّمون" here="التحليلات" />
        <div className="between" style={{ marginBottom: 6 }}>
          <h1>تقدّم {user.tenant.name_ar} بحسب الإدارة</h1>
          <a className="linkbtn" href="/api/admin/export">تصدير CSV</a>
        </div>
        <p className="muted" style={{ marginBottom: 20, maxWidth: 780 }}>
          من يسأل عن حال الجهة لا يقرأ قائمة الأسماء، يسأل أيّ إدارة تأخّرت.
          الأرقام محسوبة في قاعدة البيانات لا في هذه الصفحة، فالتقرير يُعاد
          إنتاجه بالسؤال نفسه متى طُلب.
        </p>

        <div className="kpi" style={{ marginBottom: 18 }}>
          <div><b className="num">{total}</b><span>تسجيلات</span></div>
          <div><b className="num">{watched}</b><span>أتمّوا المشاهدة</span></div>
          <div>
            <b className="num">{certified}{total ? ` · ${pct(certified, total)}٪` : ''}</b>
            <span>بشهادة</span>
          </div>
          <div>
            <b className={`num${overdue > 0 ? ' no' : ''}`}>{overdue}</b>
            <span>تجاوزوا الموعد</span>
          </div>
          <div>
            <b className="num">{gain === null ? '—' : `${gain > 0 ? '+' : ''}${gain}٪`}</b>
            <span>المكسب ({measured} مقيسًا)</span>
          </div>
        </div>

        <div className="card">
          {rows.length === 0 ? (
            <p>لا تسجيلات بعد.</p>
          ) : (
            <table className="gain" data-testid="dept-progress">
              <thead>
                <tr>
                  <th>الإدارة</th>
                  <th>تسجيلات</th>
                  <th>بدأوا</th>
                  <th>أتمّوا المشاهدة</th>
                  <th>بشهادة</th>
                  <th>نسبة الإنجاز</th>
                  <th>تجاوزوا الموعد</th>
                  <th>المكسب</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const done = pct(r.certified, r.enrolments);
                  return (
                    <tr key={r.department_id || 'none'}>
                      <td>
                        <b className={r.unassigned ? 'muted' : undefined}>{r.name_ar}</b>
                        {r.suspended > 0 ? (
                          <div className="tiny muted">منهم {r.suspended} موقوف</div>
                        ) : null}
                        {!r.unassigned && !r.is_active ? (
                          <div className="tiny muted">إدارة معطّلة</div>
                        ) : null}
                      </td>
                      <td className="num">{r.enrolments}</td>
                      <td className="num">{r.started}</td>
                      <td className="num">{r.watched}</td>
                      <td className="num">{r.certified}</td>
                      <td className="num">
                        {done === null ? '—' : (
                          <>
                            {done}٪
                            <div className="bar" style={{ marginTop: 4 }}>
                              <i style={{ width: `${done}%` }} />
                            </div>
                          </>
                        )}
                      </td>
                      <td className={`num ${r.overdue > 0 ? 'no' : 'flat'}`}>
                        {r.overdue || '—'}
                      </td>
                      <td className={`num ${r.avg_gain > 0 ? 'up' : 'flat'}`}>
                        {r.measured === 0 || r.avg_gain === null ? '—' : (
                          <span className="ltr">
                            {r.avg_gain > 0 ? '+' : ''}{r.avg_gain}
                          </span>
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
          الترتيب من أقلّ إدارة إنجازًا إلى أعلاها — فما يحتاج تدخّلًا في أعلى
          الصفحة لا في آخرها. والموقوفون محسوبون في المقام وعددهم مذكور، كي لا
          ترتفع النسبة بإيقاف حساب. والمكسب لا يظهر إلا لمن أدّى القياس القبلي،
          وهو اختياري، فعدد المقيسين مذكور إلى جانبه.
        </p>
      </main>
    </>
  );
}
