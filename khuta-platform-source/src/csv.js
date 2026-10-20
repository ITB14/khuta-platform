'use strict';
// قارئ CSV صغير — ما يكفي لملف يصدّره Excel، لا أكثر.
//
// لماذا لا مكتبة: الحاجة هي اقتباس مزدوج وفاصلة داخل خليّة وسطر جديد داخل
// خليّة وعلامة ترتيب البايتات التي يضعها Excel. وهذه أربعون سطرًا مفهومة
// خير من اعتماد جديد في منصّة حكومية.

/** يفكّ النصّ إلى صفوف من خلايا. يقبل CRLF و LF، ويتخطّى BOM. */
function parse(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', quoted = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }   // "" داخل اقتباس = "
        else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

// أسماء الأعمدة بالعربية والإنجليزية: الملفّ يأتي من جدول بشري لا من واجهة.
const HEADERS = {
  fullNameAr: ['الاسم', 'الاسم بالعربية', 'name', 'full_name', 'full_name_ar'],
  email:      ['البريد', 'البريد الإلكتروني', 'email', 'e-mail'],
  employeeNo: ['الرقم الوظيفي', 'employee_no', 'employee no', 'emp'],
  department: ['الإدارة', 'القسم', 'department', 'dept'],
  jobTitle:   ['المسمى الوظيفي', 'المسمّى الوظيفي', 'المسمى', 'job_title', 'title'],
  cohort:     ['الدفعة', 'cohort'],
};

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * يحوّل نصّ CSV إلى سجلّات بأسماء الحقول التي يفهمها provisionLearner.
 * يعيد { records, missing } — و missing أسماء الأعمدة الإلزامية الغائبة،
 * كي تُقال للمستخدم مرّة واحدة بدل أن يفشل كل صفّ على حدة.
 */
function toRecords(text) {
  const rows = parse(text);
  if (!rows.length) return { records: [], missing: ['الاسم', 'البريد'] };

  const header = rows[0].map(norm);
  const index = {};
  for (const [field, names] of Object.entries(HEADERS)) {
    const i = header.findIndex((h) => names.some((n) => norm(n) === h));
    if (i >= 0) index[field] = i;
  }

  const missing = [];
  if (index.fullNameAr === undefined) missing.push('الاسم');
  if (index.email === undefined) missing.push('البريد');
  if (missing.length) return { records: [], missing };

  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (f) => (index[f] === undefined ? null : String(row[index[f]] ?? '').trim() || null);
    records.push({
      line: r + 1,                      // رقم السطر في الملف كما يراه المستخدم
      fullNameAr: get('fullNameAr'),
      email: get('email'),
      employeeNo: get('employeeNo'),
      department: get('department'),
      jobTitle: get('jobTitle'),
      cohort: get('cohort'),
    });
  }
  return { records, missing: [] };
}

module.exports = { parse, toRecords };
