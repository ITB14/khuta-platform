import { NextResponse } from 'next/server';
const db = require('../../../../src/db');
const S = require('../../../../lib/session');
const A = require('../../../../lib/authz');

// الخطة وبنودها من صلاحية الأكاديمية. الحارس هنا، والمُحفِّزة في قاعدة
// البيانات تقوله مرّة أخرى — فلو نُسي أحدهما بقي الآخر.
const bad = (error, status = 400) => NextResponse.json({ ok: false, error }, { status });

function mapError(e) {
  if (e.code === '23505') return bad('هذا الموضوع مُدرَج في الخطة أصلًا', 409);
  if (e.code === '42501') return bad(e.message, 403);
  if (e.code === '23503') return bad('مرجعٌ غير موجود في هذه الجهة', 400);
  if (e.code === '23514') return bad('قيمة غير مقبولة', 400);
  return bad(e.message, 400);
}

export async function POST(req) {
  const user = await S.currentUser();
  const denied = A.guardTenantWide(user);
  if (denied) return denied;

  const b = await req.json().catch(() => ({}));
  const action = String(b.action || '');

  try {
    const out = await db.withTenant(user.tenant.id, user.id, async (c) => {
      switch (action) {
        case 'create': {
          const year = Number(b.cycleYear);
          if (!Number.isInteger(year) || year < 2024 || year > 2100) throw new Error('سنة غير صحيحة');
          const title = String(b.titleAr || '').trim() || `الخطة التدريبية ${year}`;
          const { rows } = await c.query(
            `insert into training_plan (tenant_id, cycle_year, title_ar)
             values (current_tenant(), $1, $2) returning id`, [year, title]);
          await db.audit(c, { action: 'plan.create', objectType: 'training_plan',
            objectId: rows[0].id, detail: { year } });
          return { planId: rows[0].id };
        }

        case 'build': {
          const { rows } = await c.query('select plan_items_from_needs($1) as n', [String(b.planId)]);
          return { added: rows[0].n };
        }

        case 'publish':
        case 'close': {
          const next = action === 'publish' ? 'published' : 'closed';
          const { rows } = await c.query(
            action === 'publish'
              ? `update training_plan set status = 'published', published_at = now(),
                        published_by = current_actor()
                  where id = $1 and status = 'draft' returning id, status`
              : `update training_plan set status = 'closed'
                  where id = $1 and status = 'published' returning id, status`,
            [String(b.planId)]);
          if (!rows.length) throw Object.assign(new Error('حال الخطة لا يسمح بهذا'), { conflict: true });
          await db.audit(c, { action: `plan.${action}`, objectType: 'training_plan',
            objectId: String(b.planId), detail: { status: next } });
          return { status: rows[0].status };
        }

        case 'add-item': {
          const skillId  = b.skillId  ? String(b.skillId)  : null;
          const courseId = b.courseId ? String(b.courseId) : null;
          const titleAr  = String(b.titleAr || '').trim() || null;
          if ([skillId, courseId, titleAr].filter(Boolean).length !== 1) {
            throw new Error('اختر موضوعًا واحدًا: مهارة أو دورة أو عنوانًا حرًّا');
          }
          const seats = Number(b.targetSeats || 0);
          if (!Number.isInteger(seats) || seats < 0) throw new Error('عدد المقاعد غير صحيح');
          const { rows } = await c.query(`
            insert into plan_item (tenant_id, plan_id, skill_id, course_id, title_ar,
                                   provider_id, target_seats, notes)
            values (current_tenant(), $1, $2, $3, $4, $5, $6, $7) returning id`,
            [String(b.planId), skillId, courseId, titleAr,
             b.providerId ? String(b.providerId) : null, seats,
             String(b.notes || '').trim() || null]);
          await db.audit(c, { action: 'plan.item.add', objectType: 'plan_item',
            objectId: rows[0].id, detail: { seats } });
          return { itemId: rows[0].id };
        }

        case 'update-item': {
          const seats = Number(b.targetSeats);
          if (!Number.isInteger(seats) || seats < 0) throw new Error('عدد المقاعد غير صحيح');
          const { rows } = await c.query(
            `update plan_item set target_seats = $2 where id = $1 returning id`,
            [String(b.itemId), seats]);
          if (!rows.length) throw Object.assign(new Error('لا بند بهذا المعرّف'), { missing: true });
          await db.audit(c, { action: 'plan.item.seats', objectType: 'plan_item',
            objectId: String(b.itemId), detail: { seats } });
          return { ok: true };
        }

        case 'delete-item': {
          const { rows } = await c.query(
            'delete from plan_item where id = $1 returning id', [String(b.itemId)]);
          if (!rows.length) throw Object.assign(new Error('لا بند بهذا المعرّف'), { missing: true });
          await db.audit(c, { action: 'plan.item.delete', objectType: 'plan_item',
            objectId: String(b.itemId), detail: null });
          return { ok: true };
        }

        default: throw Object.assign(new Error('إجراء غير معروف'), { badAction: true });
      }
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    if (e.conflict) return bad(e.message, 409);
    if (e.missing)  return bad(e.message, 404);
    return mapError(e);
  }
}
