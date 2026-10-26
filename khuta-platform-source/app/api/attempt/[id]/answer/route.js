const S = require('../../../../../lib/session');
const A = require('../../../../../lib/assess');

// النمط المفتوح: السؤال يُصحَّح لحظة الإجابة، ويُكشف الصواب وشرحه عند الخطأ.
//
// وهذا لا يفتح مفتاح الإجابات للصفحة: الصفحة لا تملك is_correct ولا تستطيع
// قراءته، وما يصلها إنما يصلها بعد أن تكون قد أجابت فعلًا. القرار كلّه في
// answer_question داخل الخادم.
export async function POST(req, { params }) {
  const user = await S.currentUser();
  if (!user) return Response.json({ ok: false, reason: 'unauthorised' }, { status: 401 });
  const { id } = await params;
  const { questionId, optionId } = await req.json().catch(() => ({}));

  const out = await A.db.withTenant(user.tenant.id, user.id, async (c) => {
    const a = await A.ownedAttempt(c, user.id, id);
    if (!a) return { status: 404, body: { ok: false, reason: 'not_found' } };
    if (a.submitted_at) return { status: 409, body: { ok: false, reason: 'already_submitted' } };

    const { rows } = await c.query('select * from answer_question($1, $2, $3)',
      [id, questionId, optionId]);
    const r = rows[0];
    if (!r.ok && r.reason !== 'already_correct') {
      return { status: 400, body: { ok: false, reason: r.reason } };
    }

    return { status: 200, body: {
      ok: true, correct: r.correct, correctOptionId: r.correct_option_id,
      explain: r.explain_ar, remaining: r.remaining, allDone: r.all_done } };
  });

  return Response.json(out.body, { status: out.status });
}
