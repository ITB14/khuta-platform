import { NextResponse } from 'next/server';
const db = require('../../../../src/db');
const S = require('../../../../lib/session');
const A = require('../../../../lib/authz');

/**
 * إجراءان لا ثالث لهما: التقاط لقطة شهر، وتفعيل قاعدة احتفاظ أو تشغيلها.
 *
 * والحذف لا يجري إلا بـ `run` صريح من مسؤول على قاعدة مفعّلة. لا ترحيلٌ
 * يحذف، ولا فتحُ صفحة يحذف، ولا جدولةٌ تحذف — الحذف لا يُستردّ، فيده يد
 * إنسان.
 */
export async function POST(req) {
  const user = await S.currentUser();
  const denied = A.guardAdmin(user);
  if (denied) return denied;

  const b = await req.json().catch(() => ({}));

  try {
    if (b.action === 'snapshot') {
      const period = b.period ? String(b.period).trim() : null;
      const n = await db.withTenant(user.tenant.id, user.id, async (c) => {
        const { rows } = period
          ? await c.query('select take_compliance_snapshot($1) n', [period])
          : await c.query('select take_compliance_snapshot() n');
        await db.audit(c, { action: 'compliance.snapshot', objectType: 'compliance_snapshot',
          detail: { period, rows: rows[0].n } });
        return rows[0].n;
      });
      return NextResponse.json({ ok: true, rows: n });
    }

    if (b.action === 'retention-toggle') {
      const out = await db.withTenant(user.tenant.id, user.id, async (c) => {
        const { rows } = await c.query(
          `update retention_rule set is_active = $2 where entity_name = $1
           returning entity_name, retain_months, is_active`,
          [String(b.entity || ''), b.isActive === true]);
        if (!rows[0]) return null;
        await db.audit(c, { action: 'retention.toggle', objectType: 'retention_rule',
          detail: { entity: b.entity, isActive: b.isActive === true } });
        return rows[0];
      });
      if (!out) return NextResponse.json({ ok: false, error: 'لا قاعدة بهذا الاسم' },
        { status: 404 });
      return NextResponse.json({ ok: true, rule: out });
    }

    if (b.action === 'retention-run') {
      const n = await db.withTenant(user.tenant.id, user.id, async (c) => {
        const { rows } = await c.query('select apply_retention($1) n',
          [String(b.entity || '')]);
        return rows[0].n;
      });
      return NextResponse.json({ ok: true, deleted: n });
    }

    return NextResponse.json({ ok: false, error: 'إجراء غير معروف' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
