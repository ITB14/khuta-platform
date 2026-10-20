import { NextResponse } from 'next/server';
const db = require('../../../../../src/db');
const S = require('../../../../../lib/session');

/** R2 + R3. The server decides; the button only asks. */
export async function POST(req, { params }) {
  const user = await S.currentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { id: lessonId } = await params;
  const { enrolmentId } = await req.json().catch(() => ({}));

  const out = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows } = await c.query('select * from complete_lesson($1,$2)', [enrolmentId, lessonId]);
    return rows[0];
  });
  return NextResponse.json({
    ok: out.ok, reason: out.reason,
    coverage: out.coverage === null ? null : Number(out.coverage),
    required: out.required === null ? null : Number(out.required),
    nextLessonNo: out.next_lesson_no,
  }, { status: out.ok ? 200 : 409 });
}
