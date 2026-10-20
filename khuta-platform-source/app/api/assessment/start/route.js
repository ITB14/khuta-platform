const S = require('../../../../lib/session');
const A = require('../../../../lib/assess');

export async function POST(req) {
  const user = await S.currentUser();
  if (!user) return Response.json({ ok: false, reason: 'unauthorised' }, { status: 401 });
  const { slug } = await req.json().catch(() => ({}));

  const out = await A.db.withTenant(user.tenant.id, user.id, async (c) => {
    const a = await A.findAssessment(c, user.id, slug);
    if (!a) return { status: 404, body: { ok: false, reason: 'not_found' } };

    const { rows } = await c.query('select * from start_attempt($1, $2)',
      [a.enrolment_id, a.assessment_id]);
    const r = rows[0];
    if (!r.ok) return { status: 409, body: { ok: false, reason: r.reason, allowed: r.allowed } };

    await A.db.audit(c, { action: 'attempt.start', objectType: 'attempt', objectId: r.attempt_id,
      detail: { slug, attemptNo: r.attempt_no } });
    // The paper travels with the attempt: one round trip, and the options the
    // learner sees are the ones the server will mark against.
    return { status: 200, body: { ok: true, attemptId: r.attempt_id, attemptNo: r.attempt_no,
      allowed: r.allowed, resumed: r.reason === 'resumed',
      questions: await A.paper(c, r.attempt_id) } };
  });

  return Response.json(out.body, { status: out.status });
}
