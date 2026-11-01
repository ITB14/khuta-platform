const db = require('../../../../src/db');
const S = require('../../../../lib/session');

/**
 * تعليم إشعارات صاحب الجلسة مقروءةً.
 *
 * الشرط `user_id = الجلسة` لا المعرّف المُرسَل: عزل الصفوف يفصل الجهات ولا
 * يفصل موظفًا عن زميله داخل الجهة، فمن يقرأ إشعارات غيره لا يمنعه إلا هذا.
 */
export async function POST() {
  const user = await S.currentUser();
  if (!user) return Response.json({ ok: false, reason: 'unauthorised' }, { status: 401 });

  const n = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rowCount } = await c.query(
      'update notification set read_at = now() where user_id = $1 and read_at is null',
      [user.id]);
    return rowCount;
  });

  return Response.json({ ok: true, marked: n });
}
