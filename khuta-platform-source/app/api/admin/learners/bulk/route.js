import { NextResponse } from 'next/server';
const db = require('../../../../../src/db');
const S = require('../../../../../lib/session');
const A = require('../../../../../lib/authz');
const { toRecords } = require('../../../../../src/csv');
const { provisionLearner } = require('../../../../../src/provision');

const MAX_ROWS = 500;

/**
 * إنشاء دفعة متعلّمين من ملف CSV.
 *
 * كل صفّ في معاملته الخاصّة عمدًا: صفّ واحد ببريد مكرّر لا يُبطل تسعة
 * وتسعين صفًّا صحيحًا، ولا يترك المسؤول يخمّن أيّها نجح. التقرير يعيد لكل
 * سطر نتيجته برقمه في الملف.
 *
 * وبيانات الدخول تعود في الردّ ولا تُحفظ: من أرادها ملفًّا بناه متصفّحه.
 */
export async function POST(req) {
  const actor = await S.currentUser();
  const denied = A.guardAdmin(actor);
  if (denied) return denied;

  const b = await req.json().catch(() => ({}));
  const { records, missing } = toRecords(b.csv || '');

  if (missing.length) {
    return NextResponse.json({
      ok: false,
      error: `الملف ينقصه عمود ${missing.join(' و')}. السطر الأوّل أسماء الأعمدة.`,
    }, { status: 400 });
  }
  if (!records.length) {
    return NextResponse.json({ ok: false, error: 'لا صفوف في الملف بعد سطر العناوين.' }, { status: 400 });
  }
  if (records.length > MAX_ROWS) {
    return NextResponse.json({
      ok: false, error: `الملف فيه ${records.length} صفًّا، والحدّ ${MAX_ROWS}. قسّمه.`,
    }, { status: 400 });
  }

  const courseCode = String(b.courseCode || 'COP-101').trim();
  const cohortFallback = String(b.cohort || '').trim() || 'Q1-2027';
  const dueDays = Number(b.dueDays);
  const due = Number.isFinite(dueDays) && dueDays > 0 && dueDays <= 365 ? dueDays : 21;

  const seen = new Set();
  const results = [];

  for (const rec of records) {
    const email = (rec.email || '').toLowerCase();
    if (!rec.fullNameAr || !rec.email) {
      results.push({ line: rec.line, email: rec.email, ok: false, error: 'الاسم أو البريد فارغ' });
      continue;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rec.email)) {
      results.push({ line: rec.line, email: rec.email, ok: false, error: 'بريد غير صالح' });
      continue;
    }
    if (seen.has(email)) {
      results.push({ line: rec.line, email: rec.email, ok: false, error: 'مكرّر داخل الملف' });
      continue;
    }
    seen.add(email);

    try {
      const made = await db.withTenant(actor.tenant.id, actor.id, (c) => provisionLearner(c, {
        email: rec.email,
        fullNameAr: rec.fullNameAr,
        employeeNo: rec.employeeNo,
        department: rec.department,
        jobTitle: rec.jobTitle,
        courseCode,
        cohort: rec.cohort || cohortFallback,
        dueDays: due,
        via: `admin-bulk:${actor.email}`,
      }));
      results.push({
        line: rec.line, ok: true,
        email: made.email, fullNameAr: made.fullNameAr,
        password: made.password, mfaSecret: made.mfaSecret,
      });
    } catch (e) {
      results.push({ line: rec.line, email: rec.email, ok: false, error: e.message });
    }
  }

  const created = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true, total: results.length, created, failed: results.length - created, results,
  });
}
