const db = require('../../../../src/db');
const S = require('../../../../lib/session');
const A = require('../../../../lib/authz');

const STANCES = ['has', 'learning', 'wants'];

/**
 * إعلان الموظف عن مهارة، أو سحب إعلانه.
 *
 * يكتب لنفسه فقط: `user_id` من الجلسة لا من الجسم. عزل الصفوف يفصل الجهات
 * ولا يفصل موظفًا عن زميله داخل الجهة، فلا شيء غير هذا يمنع من يعلن نيابةً
 * عن غيره.
 *
 * وجرد المهارات إعلانٌ لا شهادة: لا يُقاس عليه أحد ولا يُحاسَب، وإنما
 * يُعرف منه أيّ دورة تُصوَّر بعد ذلك.
 */
export async function POST(req) {
  const user = await S.currentUser();
  if (!user) return Response.json({ ok: false, reason: 'unauthorised' }, { status: 401 });
  if (A.learnerDenial(user) === 'change-password') {
    return Response.json({ ok: false, reason: 'change-password' }, { status: 409 });
  }

  const b = await req.json().catch(() => ({}));
  const skillId = String(b.skillId || '').trim();
  const stance = b.stance === null || b.stance === '' ? null : String(b.stance || '');

  if (!skillId) return Response.json({ ok: false, error: 'لم تُحدَّد المهارة' }, { status: 400 });
  if (stance !== null && !STANCES.includes(stance)) {
    return Response.json({ ok: false, error: 'حالة غير معروفة' }, { status: 400 });
  }

  try {
    const out = await db.withTenant(user.tenant.id, user.id, async (c) => {
      if (stance === null) {
        const { rowCount } = await c.query(
          'delete from user_skill where user_id = $1 and skill_id = $2', [user.id, skillId]);
        return { removed: rowCount > 0 };
      }
      // المهارة المعطّلة لا تُضاف من جديد، ومن أعلنها قبل التعطيل يبقى إعلانه.
      const { rows: ok } = await c.query(
        'select 1 from skill where id = $1 and is_active', [skillId]);
      if (!ok[0]) return { err: 'هذه المهارة غير متاحة' };

      await c.query(`
        insert into user_skill (tenant_id, user_id, skill_id, stance)
        values (current_tenant(), $1, $2, $3::skill_stance)
        on conflict (user_id, skill_id) do update set stance = excluded.stance`,
        [user.id, skillId, stance]);
      return { stance };
    });

    if (out.err) return Response.json({ ok: false, error: out.err }, { status: 400 });
    return Response.json({ ok: true, ...out });
  } catch (e) {
    if (e.code === '23503') {
      return Response.json({ ok: false, error: 'هذه المهارة ليست في جهتك' }, { status: 400 });
    }
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
