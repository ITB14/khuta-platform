import { NextResponse } from 'next/server';
const db = require('../../../../src/db');
const S = require('../../../../lib/session');
const A = require('../../../../lib/authz');

// التصريح هنا طبقتان لا واحدة: هذا المسار يتحقّق من الشكل ومن الاعتماد،
// والنطاق (أيّ إدارة وأيّ موظّف) تفرضه مُحفِّزة `training_need_guard` في
// قاعدة البيانات. فلو نُسي الحارس هنا يومًا بقي المنع قائمًا.
const SCOPES     = new Set(['individual', 'department']);
const PRIORITIES = new Set(['high', 'medium', 'low']);
const SOURCES    = new Set(['self', 'manager', 'department', 'assessment']);

const bad = (error, status = 400) => NextResponse.json({ ok: false, error }, { status });

function mapError(e) {
  if (e.code === '23505') return bad('هذا الاحتياج مرفوعٌ لهذا الموظّف في هذه الدورة', 409);
  if (e.code === '42501') return bad(e.message, 403);
  if (e.code === '23514') return bad('بيانات الاحتياج غير متّسقة', 400);
  if (e.code === '23503') return bad('مرجعٌ غير موجود في هذه الجهة', 400);
  return bad(e.message, 400);
}

/** رفع احتياج. الموظّف يرفع لنفسه، ورئيس الإدارة لمن يراه، والأكاديمية للجميع. */
export async function POST(req) {
  const user = await S.currentUser();
  if (!user) return bad('unauthorised', 401);

  const b = await req.json().catch(() => ({}));

  const year = Number(b.cycleYear);
  if (!Number.isInteger(year) || year < 2024 || year > 2100) return bad('سنة الدورة غير صحيحة');

  const scope = String(b.scope || '');
  if (!SCOPES.has(scope)) return bad('نطاق الاحتياج غير معروف');

  const skillId  = b.skillId  ? String(b.skillId)  : null;
  const courseId = b.courseId ? String(b.courseId) : null;
  const titleAr  = String(b.titleAr || '').trim() || null;
  if ([skillId, courseId, titleAr].filter(Boolean).length !== 1) {
    return bad('اختر موضوعًا واحدًا: مهارة أو دورة أو عنوانًا حرًّا');
  }

  const departmentId = b.departmentId ? String(b.departmentId) : null;
  const userId       = b.userId ? String(b.userId) : null;
  if (scope === 'department' && !departmentId) return bad('احتياج الإدارة يحتاج إدارة');
  if (scope === 'individual' && !userId)       return bad('الاحتياج الفردي يحتاج موظّفًا');

  // الفردي شخصٌ واحد دائمًا — والقيد في قاعدة البيانات أيضًا.
  const headcount = scope === 'department' ? Number(b.headcount || 1) : 1;
  if (!Number.isInteger(headcount) || headcount < 1) return bad('عدد الموظفين غير صحيح');

  const priority = PRIORITIES.has(b.priority) ? b.priority : 'medium';
  const source   = SOURCES.has(b.source) ? b.source
    : (scope === 'department' ? 'department'
      : (userId === user.id ? 'self' : 'manager'));
  const status   = b.submit ? 'submitted' : 'draft';

  try {
    const made = await db.withTenant(user.tenant.id, user.id, async (c) => {
      const { rows } = await c.query(`
        insert into training_need
          (tenant_id, cycle_year, scope, department_id, user_id, skill_id, course_id,
           title_ar, headcount, priority, source, justification, status, raised_by)
        values (current_tenant(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        returning id`,
        [year, scope, departmentId, userId, skillId, courseId, titleAr, headcount,
         priority, source, String(b.justification || '').trim() || null, status, user.id]);
      await db.audit(c, { action: 'need.raise', objectType: 'training_need',
        objectId: rows[0].id, detail: { scope, year, headcount, status } });
      return rows[0];
    });
    return NextResponse.json({ ok: true, id: made.id });
  } catch (e) { return mapError(e); }
}

/**
 * رفعٌ للمراجعة، أو اعتمادٌ ورفض.
 * الاعتماد من صلاحية الأكاديمية وحدها — هنا وفي المُحفِّزة معًا، فمن يرفع
 * لا يعتمد لنفسه.
 */
export async function PATCH(req) {
  const user = await S.currentUser();
  if (!user) return bad('unauthorised', 401);

  const b = await req.json().catch(() => ({}));
  const id = String(b.id || '');
  if (!id) return bad('لا احتياج محدّد');

  const action = String(b.action || '');
  if (!['submit', 'approve', 'reject'].includes(action)) return bad('إجراء غير معروف');

  if (action !== 'submit') {
    const denied = A.guardTenantWide(user);
    if (denied) return denied;
  }

  const next = action === 'submit' ? 'submitted'
    : action === 'approve' ? 'approved' : 'rejected';

  try {
    const out = await db.withTenant(user.tenant.id, user.id, async (c) => {
      // القراءة من المنظر لا من الجدول: ما لا يراه لا يغيّره.
      const { rows: seen } = await c.query(
        'select id, status from visible_training_need where id = $1', [id]);
      if (!seen.length) return { missing: true };
      if (action === 'submit' && seen[0].status !== 'draft') {
        return { conflict: 'لا يُرفع إلا ما كان مسوّدة' };
      }
      if (action !== 'submit' && seen[0].status !== 'submitted') {
        return { conflict: 'لا يُعتمد إلا ما رُفع للمراجعة' };
      }
      // جملتان لا جملة بـ case: المُعامل الواحد لا يُستنتج له نوعان، والوقت
      // من ساعة الخادم لا من ساعة المتصفّح.
      const { rows } = action === 'submit'
        ? await c.query(`
            update training_need
               set status = 'submitted', decided_by = null,
                   decided_at = null, decision_note = null
             where id = $1 returning id, status`, [id])
        : await c.query(`
            update training_need
               set status = $2::need_status, decided_by = current_actor(),
                   decided_at = now(), decision_note = $3
             where id = $1 returning id, status`,
            [id, next, String(b.note || '').trim() || null]);
      await db.audit(c, { action: `need.${action}`, objectType: 'training_need',
        objectId: id, detail: { status: next } });
      return { row: rows[0] };
    });

    if (out.missing)  return bad('لا احتياج بهذا المعرّف', 404);
    if (out.conflict) return bad(out.conflict, 409);
    return NextResponse.json({ ok: true, need: out.row });
  } catch (e) { return mapError(e); }
}
