const S = require('../../../../../lib/session');
const A = require('../../../../../lib/assess');

export async function POST(req, { params }) {
  const user = await S.currentUser();
  if (!user) return Response.json({ ok: false, reason: 'unauthorised' }, { status: 401 });
  const { id } = await params;

  const out = await A.db.withTenant(user.tenant.id, user.id, async (c) => {
    const a = await A.ownedAttempt(c, user.id, id);
    if (!a) return { status: 404, body: { ok: false, reason: 'not_found' } };
    if (a.submitted_at) return { status: 200, body: { ok: true, already: true } };

    const { rows } = await c.query('select * from submit_attempt($1)', [id]);
    const r = rows[0];
    if (!r.ok) return { status: 409, body: { ok: false, reason: r.reason } };

    await A.db.audit(c, { action: 'attempt.submit', objectType: 'attempt', objectId: id,
      detail: { kind: a.kind, score: r.score, passed: r.passed } });
    return { status: 200, body: { ok: true, score: Number(r.score), passMark: r.pass_mark && Number(r.pass_mark),
      passed: r.passed, correct: r.correct_n, total: r.total_n, unanswered: r.unanswered_n,
      nextLessonNo: r.next_lesson_no, certificateSerial: r.certificate_serial } };
  });

  return Response.json(out.body, { status: out.status });
}
