import { NextResponse } from 'next/server';
const db = require('../../../../src/db');
const S = require('../../../../lib/session');

/** R1 — the pre-assessment gate. Opening the course is where it is enforced. */
export async function POST(req) {
  const user = await S.currentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { enrolmentId } = await req.json().catch(() => ({}));
  const out = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows } = await c.query('select * from open_course($1)', [enrolmentId]);
    return rows[0];
  });
  return NextResponse.json(out, { status: out.ok ? 200 : 409 });
}
