import { redirect } from 'next/navigation';
import Link from 'next/link';
import { GovStrip, PlatformBar, DemoBanner } from '../../../components/Chrome';
import SignOutButton from '../../dashboard/SignOutButton';
import Player from './Player';
const db = require('../../../src/db');
const S = require('../../../lib/session');
const A = require('../../../lib/authz');
const M = require('../../../lib/media');

export const dynamic = 'force-dynamic';

export default async function LessonPage({ params }) {
  const { no } = await params;
  const user = await S.currentUser();
  if (!user) redirect('/signin');
  if (A.learnerDenial(user) === 'change-password') redirect('/account/password');

  const data = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows } = await c.query(`
      select l.id, l.no, l.title_ar, l.start_sec, l.end_sec, l.required_watch_ratio,
             e.id as enrolment_id, co.title_ar as course_title, co.mode,
             lp.unlocked_at, lp.completed_at,
             (select json_agg(json_build_object('key', r.storage_key, 'mime', r.mime)
                       order by case r.mime when 'video/mp4' then 0 else 1 end)
                from media_rendition r where r.asset_id = l.asset_id) as renditions,
             lesson_coverage(e.id, l.id) as coverage,
             pre_assessment_done(e.id) as pre_done
        from enrolment e
        join course co on co.id = e.course_id
        join lesson l on l.course_id = co.id and l.no = $2
        left join lesson_progress lp on lp.enrolment_id = e.id and lp.lesson_id = l.id
       where e.user_id = $1
       limit 1`, [user.id, Number(no)]);
    return rows[0] || null;
  });

  if (!data) redirect('/dashboard');

  // في النمط المفتوح لا بوّابة قبليّة ولا أقفال، فلا تُعرض رسالتاهما — وهما
  // كانتا تُخفيان المشغّل عن متعلّم لم يؤدِّ قياسًا صار اختياريًّا.
  const open = data.mode === 'open';
  const locked = !open && !data.unlocked_at;
  const gatedByPre = !open && !data.pre_done;
  // Every rendition is signed separately and bound to this viewer. The browser
  // picks the first one it can decode; none of them is a shareable link.
  const sources = locked ? [] : (data.renditions || [])
    .map((r) => ({ src: M.signMediaUrl(r.key, user.id), type: r.mime }));

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap">
        <p className="tiny" style={{ marginBottom: 6 }}>
          <Link href="/dashboard">الرئيسية</Link> · {data.course_title}
        </p>
        <h1>الدرس {data.no} — {data.title_ar}</h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          المدّة {Math.round((data.end_sec - data.start_sec) / 60)} دقائق ·
          لا يُحتسب مكتملًا قبل مشاهدة {(Number(data.required_watch_ratio) * 100).toFixed(0)}٪ منه
        </p>

        {gatedByPre ? (
          <div className="card"><div className="alert" data-testid="gate-r1">
            لا يُفتح أي درس قبل أداء التقييم القبلي. ابدأ به من الصفحة الرئيسية.
          </div></div>
        ) : locked ? (
          <div className="card"><div className="alert" data-testid="gate-r3">
            هذا الدرس مقفل. يُفتح بعد إكمال الدرس {data.no - 1}.
          </div></div>
        ) : (
          <div className="card">
            <Player
              lesson={{
                id: data.id, no: data.no,
                requiredRatio: Number(data.required_watch_ratio),
                coverage: Number(data.coverage),
                completedAt: data.completed_at,
              }}
              enrolmentId={data.enrolment_id}
              sources={sources}
              demo={{ on: !!user.tenant.demo_mode, speed: user.tenant.demo_speed }}
            />
          </div>
        )}
      </main>
    </>
  );
}
