import { NextResponse } from 'next/server';
const db = require('../../../../../../src/db');
const S = require('../../../../../../lib/session');
const A = require('../../../../../../lib/authz');

/**
 * دمج إدارة في أخرى.
 *
 * الجدول وحده لا يُصلح ما سبقه: «الصحة العامة» و«الصحة العامة والبيئة» تدخلان
 * معًا عند النقل لأن النقل لا يخمّن، ويبقى على المسؤول أن يقرّر أنهما واحدة.
 * وبلا هذا الإجراء يقف عاجزًا — فالتسمية تصطدم بقيد التفرّد، والتعطيل يترك
 * موظفًا معلّقًا بإدارة معطّلة.
 *
 * الدمج: يُنقل الموظفون إلى الوجهة، ثم تُعطَّل المصدر ولا تُحذف — فتقارير
 * الأمس تبقى مفهومة.
 */
export async function POST(req, { params }) {
  const user = await S.currentUser();
  const denied = A.guardAdmin(user);
  if (denied) return denied;

  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const intoId = String(b.intoId || '').trim();

  if (!intoId) {
    return NextResponse.json({ ok: false, error: 'اختر الإدارة التي تُدمج فيها' },
      { status: 400 });
  }
  if (intoId === id) {
    return NextResponse.json({ ok: false, error: 'لا تُدمج إدارة في نفسها' },
      { status: 400 });
  }

  try {
    const out = await db.withTenant(user.tenant.id, user.id, async (c) => {
      const { rows: both } = await c.query(
        `select id, name_ar, is_active from department where id = any($1::uuid[])`,
        [[id, intoId]]);
      const from = both.find((d) => d.id === id);
      const into = both.find((d) => d.id === intoId);
      if (!from || !into) return { err: 'إحدى الإدارتين غير موجودة', status: 404 };
      if (!into.is_active) return { err: 'لا تُدمج إدارة في إدارة معطّلة', status: 400 };

      // الأبناء يتبعون الوجهة، وإلّا بقي المصدر مرجعًا لا يراه أحد.
      await c.query('update department set parent_id = $2 where parent_id = $1', [id, intoId]);
      const { rowCount: moved } = await c.query(
        'update app_user set department_id = $2 where department_id = $1', [id, intoId]);
      await c.query('update department set is_active = false where id = $1', [id]);

      await db.audit(c, { action: 'department.merge', objectType: 'department',
        objectId: id, detail: { into: intoId, fromName: from.name_ar,
          intoName: into.name_ar, moved } });

      return { moved, fromName: from.name_ar, intoName: into.name_ar };
    });

    if (out.err) return NextResponse.json({ ok: false, error: out.err }, { status: out.status });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
