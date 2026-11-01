import { redirect } from 'next/navigation';
import Link from 'next/link';
import { GovStrip, PlatformBar, DemoBanner } from '../../components/Chrome';
import Back from '../../components/Back';
import SignOutButton from '../dashboard/SignOutButton';
import MarkAllRead from './MarkAllRead';
const db = require('../../src/db');
const S = require('../../lib/session');
const A = require('../../lib/authz');

export const dynamic = 'force-dynamic';

const KIND = {
  enrolled: 'تسجيل',
  due_soon: 'موعد',
  overdue: 'تأخّر',
  certificate: 'شهادة',
  access_reset: 'وصول',
};

function when(d) {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `قبل ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} ساعة`;
  if (diff < 86400 * 30) return `قبل ${Math.floor(diff / 86400)} يومًا`;
  return new Date(d).toLocaleDateString('ar-AE');
}

export default async function Notifications() {
  const user = await S.currentUser();
  if (!user) redirect('/signin');
  if (A.learnerDenial(user) === 'change-password') redirect('/account/password');

  const rows = await db.withTenant(user.tenant.id, user.id, async (c) => {
    // الاشتقاق قبل القراءة: لا مُجدوِل يمرّ كل ليلة، فالحالة تُترجَم إلى
    // إشعار في اللحظة التي يُنظر فيها. وقيد التفرّد يمنع التكرار.
    await c.query('select refresh_due_notifications($1)', [user.id]);
    const { rows } = await c.query(`
      select id, kind, title_ar, body_ar, href, created_at, read_at
        from notification
       where user_id = $1
       order by read_at is not null, created_at desc
       limit 100`, [user.id]);
    return rows;
  });

  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap" style={{ maxWidth: 820 }}>
        <Back href="/dashboard" label="الرئيسية" here="الإشعارات" />
        <div className="between" style={{ marginBottom: 6 }}>
          <h1>الإشعارات</h1>
          {unread > 0 ? <MarkAllRead /> : null}
        </div>
        <p className="muted" style={{ marginBottom: 20 }}>
          تظهر هنا داخل المنصة ولا تُرسَل بريدًا — لا بريد في المنصة بعد.
        </p>

        {rows.length === 0 ? (
          <div className="card"><p className="muted">لا إشعارات لك.</p></div>
        ) : (
          <div className="card" data-testid="notifications">
            {rows.map((n) => (
              <div key={n.id} className={`lesson${n.read_at ? '' : ' unread'}`}>
                <div className="t">
                  {n.href ? (
                    <Link href={n.href}><b>{n.title_ar}</b></Link>
                  ) : <b>{n.title_ar}</b>}
                  {n.body_ar ? <span className="tiny">{n.body_ar}</span> : null}
                </div>
                <span className={`pill${n.kind === 'overdue' ? '' : n.read_at ? '' : ' gold'}`}>
                  {KIND[n.kind] || n.kind}
                </span>
                <span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>
                  {when(n.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
