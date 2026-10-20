const db = require('../../../../src/db');
const S = require('../../../../lib/session');
const A = require('../../../../lib/authz');

/**
 * تصدير قائمة المتعلّمين إلى CSV.
 *
 * بعلامة ترتيب البايتات في أوّل الملف: بدونها يفتح Excel العربية محارفَ
 * مشوّهة، فيُظنّ الخلل في المنصّة وهو في افتراض Excel للترميز.
 *
 * ولا يحمل الملف أسرارًا — لا كلمات مرور ولا رموز تحقّق — لأنه يُرسل
 * بالبريد ويُحفظ على أجهزة لا تحكمها المنصّة.
 */
const cell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const pct = (v) => (v === null || v === undefined ? '' : Math.round(Number(v) * 100));

export async function GET() {
  const user = await S.currentUser();
  const denied = A.guardAdmin(user);
  if (denied) return denied;

  const rows = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows } = await c.query(`
      select u.full_name_ar, u.email, u.employee_no, u.department, u.job_title, u.status,
             e.id as enrolment_id, co.title_ar as course_title, e.cohort, e.due_at,
             (select count(*) from lesson l where l.course_id = co.id)::int as lessons,
             (select count(*) from lesson_progress lp
                join lesson l2 on l2.id = lp.lesson_id
               where l2.course_id = co.id and lp.enrolment_id = e.id
                 and lp.completed_at is not null)::int as done,
             (select max(a.score) from attempt a
                join assessment s on s.id = a.assessment_id
               where a.enrolment_id = e.id and s.kind = 'pre'
                 and a.submitted_at is not null) as pre_score,
             (select max(a.score) from attempt a
                join assessment s on s.id = a.assessment_id
               where a.enrolment_id = e.id and s.kind = 'post'
                 and a.submitted_at is not null) as post_score,
             (select ct.serial from certificate ct
               where ct.enrolment_id = e.id and ct.revoked_at is null
               order by ct.issued_at desc limit 1) as cert_serial,
             (select ct.issued_at from certificate ct
               where ct.enrolment_id = e.id and ct.revoked_at is null
               order by ct.issued_at desc limit 1) as cert_at
        from app_user u
        join user_role_grant g on g.user_id = u.id and g.role = 'learner'
        left join enrolment e on e.user_id = u.id
        left join course co on co.id = e.course_id
       order by u.full_name_ar, co.title_ar`);
    return rows;
  });

  const head = ['الاسم', 'البريد', 'الرقم الوظيفي', 'الإدارة', 'المسمّى الوظيفي',
                'حالة الحساب', 'الدورة', 'الدفعة', 'الموعد النهائي',
                'الدروس المكتملة', 'عدد الدروس', 'التقييم القبلي ٪',
                'التقييم البعدي ٪', 'مكسب التعلّم ٪', 'رقم الشهادة', 'تاريخ الإصدار'];

  const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

  const lines = [head.map(cell).join(',')];
  for (const r of rows) {
    const pre = pct(r.pre_score);
    const post = pct(r.post_score);
    lines.push([
      r.full_name_ar, r.email, r.employee_no, r.department, r.job_title,
      r.status === 'suspended' ? 'موقوف' : r.status === 'invited' ? 'لم يُفعَّل' : 'نشط',
      r.course_title, r.cohort, day(r.due_at),
      r.enrolment_id === null ? '' : r.done, r.course_title ? r.lessons : '',
      pre, post, pre !== '' && post !== '' ? post - pre : '',
      r.cert_serial, day(r.cert_at),
    ].map(cell).join(','));
  }

  const today = new Date().toISOString().slice(0, 10);
  // ﻿ ثمّ CRLF — هكذا يقرأ Excel العربية صحيحةً دون إعدادات.
  const body = '﻿' + lines.join('\r\n') + '\r\n';

  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="khuta-learners-${today}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
