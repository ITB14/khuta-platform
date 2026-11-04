import { NextResponse } from 'next/server';
const db = require('../../../../../src/db');
const S = require('../../../../../lib/session');

// الاختيار يملكه رئيس الإدارة لإدارته، والأكاديمية لأيّها. ولا حارس أدوار
// هنا عمدًا: النطاق أدقّ من دور — أيّ إدارة بعينها — ومُحفِّزة
// `plan_selection_guard` هي التي تعرفه. هنا المصادقة والشكل فقط.
const bad = (error, status = 400) => NextResponse.json({ ok: false, error }, { status });

const PRIORITIES = new Set(['high', 'medium', 'low']);

function mapError(e) {
  if (e.code === '42501') return bad(e.message, 403);
  if (e.code === '23503') return bad('بندٌ أو إدارةٌ غير موجودة', 400);
  if (e.code === '23514') return bad('عدد المقاعد غير مقبول', 400);
  return bad(e.message, 400);
}

/** اختيارٌ جديد أو تعديل عددٍ قائم — الإدارة الواحدة صفٌّ واحد على البند. */
export async function POST(req) {
  const user = await S.currentUser();
  if (!user) return bad('unauthorised', 401);

  const b = await req.json().catch(() => ({}));
  const itemId = String(b.planItemId || '');
  const deptId = String(b.departmentId || '');
  if (!itemId || !deptId) return bad('البند والإدارة مطلوبان');

  const seats = Number(b.seats);
  if (!Number.isInteger(seats) || seats < 1) return bad('عدد المقاعد واحدٌ فأكثر');
  const priority = PRIORITIES.has(b.priority) ? b.priority : 'medium';

  try {
    await db.withTenant(user.tenant.id, user.id, async (c) => {
      await c.query(`
        insert into plan_selection (tenant_id, plan_item_id, department_id, seats,
                                    priority, note, selected_by)
        values (current_tenant(), $1, $2, $3, $4, $5, current_actor())
        on conflict (plan_item_id, department_id) do update
          set seats = excluded.seats, priority = excluded.priority,
              note = excluded.note, selected_by = excluded.selected_by,
              selected_at = now()`,
        [itemId, deptId, seats, priority, String(b.note || '').trim() || null]);
      await db.audit(c, { action: 'plan.select', objectType: 'plan_item',
        objectId: itemId, detail: { departmentId: deptId, seats, priority } });
    });
    return NextResponse.json({ ok: true });
  } catch (e) { return mapError(e); }
}

/** سحب اختيار. */
export async function DELETE(req) {
  const user = await S.currentUser();
  if (!user) return bad('unauthorised', 401);

  const b = await req.json().catch(() => ({}));
  const itemId = String(b.planItemId || '');
  const deptId = String(b.departmentId || '');
  if (!itemId || !deptId) return bad('البند والإدارة مطلوبان');

  try {
    const gone = await db.withTenant(user.tenant.id, user.id, async (c) => {
      const { rows } = await c.query(
        `delete from plan_selection where plan_item_id = $1 and department_id = $2
         returning plan_item_id`, [itemId, deptId]);
      if (rows.length) {
        await db.audit(c, { action: 'plan.unselect', objectType: 'plan_item',
          objectId: itemId, detail: { departmentId: deptId } });
      }
      return rows.length > 0;
    });
    if (!gone) return bad('لا اختيار لهذه الإدارة على هذا البند', 404);
    return NextResponse.json({ ok: true });
  } catch (e) { return mapError(e); }
}
