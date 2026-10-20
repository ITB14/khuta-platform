import { NextResponse } from 'next/server';
const db = require('../../../../../src/db');
const S = require('../../../../../lib/session');

/**
 * R2. The browser sends only where the playhead is. The time is the database
 * clock, the coverage is computed server-side, and a beat arriving faster than
 * real time is refused by a trigger — not by this handler, which could be
 * bypassed, but by the table itself, which cannot.
 */
export async function POST(req, { params }) {
  const user = await S.currentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { id: lessonId } = await params;
  const { enrolmentId, positionSec, seq } = await req.json().catch(() => ({}));

  try {
    const out = await db.withTenant(user.tenant.id, user.id, async (c) => {
      await c.query(
        `insert into watch_heartbeat (tenant_id, enrolment_id, lesson_id, position_sec, client_seq)
         values (current_tenant(), $1, $2, $3, $4)`,
        [enrolmentId, lessonId, Math.max(0, Math.floor(Number(positionSec) || 0)), seq ?? null]);
      const { rows } = await c.query(
        `select lesson_coverage($1,$2) cov, l.required_watch_ratio req, now() at_server
           from lesson l where l.id = $2`, [enrolmentId, lessonId]);
      return rows[0];
    });
    return NextResponse.json({
      ok: true, coverage: Number(out.cov), required: Number(out.req), serverTime: out.at_server,
    });
  } catch (e) {
    if (String(e.message).includes('heartbeat rejected')) {
      return NextResponse.json({ ok: false, reason: 'rate', message: e.message }, { status: 429 });
    }
    throw e;
  }
}
