const S = require('../../../../../lib/session');
const A = require('../../../../../lib/assess');

// The answer is recorded; whether it was right is not returned. Marking is a
// property of the submitted paper, not of each click (R5).
export async function POST(req, { params }) {
  const user = await S.currentUser();
  if (!user) return Response.json({ ok: false, reason: 'unauthorised' }, { status: 401 });
  const { id } = await params;
  const { questionId, optionId } = await req.json().catch(() => ({}));

  const out = await A.db.withTenant(user.tenant.id, user.id, async (c) => {
    const a = await A.ownedAttempt(c, user.id, id);
    if (!a) return { status: 404, body: { ok: false, reason: 'not_found' } };
    if (a.submitted_at) return { status: 409, body: { ok: false, reason: 'already_submitted' } };
    try {
      await c.query('select submit_response($1, $2, $3)', [id, questionId, optionId]);
    } catch (e) {
      return { status: 400, body: { ok: false, reason: 'bad_option' } };
    }
    const { rows } = await c.query(
      'select count(*)::int n from attempt_response where attempt_id = $1', [id]);
    return { status: 200, body: { ok: true, answered: rows[0].n, total: a.total } };
  });

  return Response.json(out.body, { status: out.status });
}
