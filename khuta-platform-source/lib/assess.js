'use strict';
// Shared between the pages and the API routes so that both ask the database
// the same question and get the same answer.
const db = require('../src/db');

// A slug the URL can carry: 'pre', 'post', or 'lesson-3'.
function parseSlug(slug) {
  if (slug === 'pre' || slug === 'post') return { kind: slug, lessonNo: null };
  const m = /^lesson-(\d{1,2})$/.exec(slug || '');
  return m ? { kind: 'lesson', lessonNo: Number(m[1]) } : null;
}

async function findAssessment(c, userId, slug) {
  const s = parseSlug(slug);
  if (!s) return null;
  const { rows } = await c.query(`
    select a.id as assessment_id, a.kind, a.pass_mark, a.max_attempts,
           e.id as enrolment_id, co.title_ar as course_title,
           l.no as lesson_no, l.title_ar as lesson_title,
           (select count(*) from question q where q.assessment_id = a.id)::int as total,
           g.ok, g.reason, g.used, g.allowed
      from enrolment e
      join course co on co.id = e.course_id
      join assessment a on a.course_id = co.id and a.kind = $2::assessment_kind
      left join lesson l on l.id = a.lesson_id
      cross join lateral assessment_gate(e.id, a.id) g
     where e.user_id = $1 and ($3::int is null or l.no = $3::int)
     limit 1`, [userId, s.kind, s.lessonNo]);
  return rows[0] || null;
}

// The attempt has to belong to the signed-in learner, not merely to the tenant.
async function ownedAttempt(c, userId, attemptId) {
  const { rows } = await c.query(`
    select a.id, a.submitted_at, a.attempt_no, a.score, a.passed,
           s.kind, s.pass_mark, s.max_attempts, e.id as enrolment_id,
           co.title_ar as course_title, l.no as lesson_no,
           (select count(*) from question q where q.assessment_id = s.id)::int as total
      from attempt a
      join enrolment e on e.id = a.enrolment_id
      join assessment s on s.id = a.assessment_id
      join course co on co.id = e.course_id
      left join lesson l on l.id = s.lesson_id
     where a.id = $2 and e.user_id = $1`, [userId, attemptId]);
  return rows[0] || null;
}

// attempt_paper returns one row per option; the screen wants one per question.
async function paper(c, attemptId) {
  const { rows } = await c.query(
    `select * from attempt_paper($1)`, [attemptId]);
  const out = [];
  const byId = new Map();
  for (const r of rows) {
    let q = byId.get(r.question_id);
    if (!q) {
      q = { id: r.question_id, externalId: r.external_id, stem: r.stem_ar, options: [], chosen: null };
      byId.set(r.question_id, q); out.push(q);
    }
    q.options.push({ id: r.option_id, label: r.label, text: r.text_ar });
    if (r.chosen) q.chosen = r.option_id;
  }
  return out;
}

const REASONS = {
  not_found: 'هذا التقييم غير متاح لك.',
  already_passed: 'سبق أن اجتزت هذا التقييم.',
  already_submitted: 'سبق أن أدّيت هذا التقييم.',
  lesson_not_complete: 'يُفتح اختبار الدرس بعد مشاهدة ٩٥٪ منه.',
  lessons_outstanding: 'يُفتح التقييم البعدي بعد إكمال الدروس الخمسة واجتياز اختباراتها.',
  no_attempts_left: 'استُنفدت المحاولات المسموح بها لهذا التقييم.',
};

module.exports = { parseSlug, findAssessment, ownedAttempt, paper, REASONS, db };
