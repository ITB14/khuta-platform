'use strict';
// محاذاة بنك الأسئلة مع نصّ الفيديو.
//
//   node scripts/align_questions.js <ملف التفريغ> [--window 45] [--hop 15]
//
// يقرأ التفريغ (SRT أو VTT أو نصًّا بطوابع [mm:ss])، ثم يبحث لكل سؤال من
// الأربعين عن الموضع الذي يدعمه في الفيديو، ويُخرج تقريرًا بثلاثة أحكام:
// مدعوم، ودعمه ضعيف، وغير مدعوم إطلاقًا — وهذا الأخير هو ما يجب تعديله أو
// حذفه قبل اعتماد الدورة.
//
// الأداة ترجيحية لا قاطعة: تُرتّب المراجعة البشرية ولا تُغني عنها. وكل حكم
// مصحوب بالموضع الزمني كي يُراجَع في ثوانٍ لا بإعادة مشاهدة الفيديو كلّه.
const fs = require('node:fs');
const path = require('node:path');

const SRC = process.argv[2];
if (!SRC) {
  console.error('الاستخدام: node scripts/align_questions.js <ملف التفريغ>');
  process.exit(1);
}
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const WINDOW = arg('window', 60);     // ثانية
const HOP = arg('hop', 20);
// الحقيقة التي يختبرها السؤال تسكن في إجابته الصحيحة؛ وصياغة السؤال تدلّ على
// الموضوع فقط. فتُوزن الإجابة أثقل، وإلا رسب سؤالٌ شرحه الفيديو بوضوح لمجرّد
// أن صياغة سؤالنا اختارت كلمات أخرى.
const W_STEM = 0.4, W_ANSWER = 0.6;
const STRONG = 0.55, WEAK = 0.30;

// ----------------------------------------------------------- التطبيع ------
// التشكيل والتطويل يُحذفان، وصور الألف والياء والتاء المربوطة تُوحَّد، كي
// تتطابق كلمة الفيديو المنطوقة مع كلمة السؤال المكتوبة.
const STOP = new Set(`في من على إلى عن مع هذا هذه ذلك تلك التي الذي ما لا أن إن كان تكون يكون
هو هي ثم أو قد كل بعض عند بين حيث كما لكن إذا هل أي أين كيف متى لماذا نعم غير دون بلا عبر
خلال بعد قبل حتى منذ لدى له لها به بها عليه عليها عليك لك لنا هنا هناك ذلكم أيضا أيضًا
يمكن يجب ينبغي الأنسب الأصح الأهم التالي التالية شيء شيئا أشياء نفسه نفسها`
  .split(/\s+/).map(normalise).filter(Boolean));

function normalise(s) {
  return String(s)
    .replace(/[ً-ْٰـ]/g, '')        // تشكيل وتطويل
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[ؤئ]/g, 'ء')
    .toLowerCase();
}
function tokens(s) {
  return normalise(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t && !STOP.has(t) && (/[a-z0-9]/.test(t) ? t.length >= 2 : t.length >= 3));
}

// ---------------------------------------------------------- التفريغ -------
const TS = {
  srt: /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/,
  inline: /^\s*[\[(]?(\d{1,2}):(\d{2})(?::(\d{2}))?[\])]?\s*(.*)$/,
};
function parseTranscript(text) {
  const lines = text.split(/\r?\n/);
  const cues = [];
  let pending = null;

  for (const line of lines) {
    const m = TS.srt.exec(line);
    if (m) {
      if (pending) cues.push(pending);
      const at = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
      const to = (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]);
      pending = { start: at, end: to, text: '' };
      continue;
    }
    if (/^\s*(WEBVTT|\d+)\s*$/.test(line)) continue;
    if (pending) { pending.text += ' ' + line; continue; }

    const n = TS.inline.exec(line);
    if (n) {
      const at = n[3] ? (+n[1]) * 3600 + (+n[2]) * 60 + (+n[3]) : (+n[1]) * 60 + (+n[2]);
      cues.push({ start: at, end: at, text: n[4] || '' });
    }
  }
  if (pending) cues.push(pending);

  // طوابع نهاية مفقودة: تُستنتج من بداية ما يليها
  for (let i = 0; i < cues.length; i++) {
    if (!(cues[i].end > cues[i].start)) {
      cues[i].end = i + 1 < cues.length ? cues[i + 1].start : cues[i].start + 5;
    }
  }
  return cues.filter((c) => c.text.trim());
}

function buildWindows(cues) {
  if (!cues.length) return [];
  const total = cues[cues.length - 1].end;
  const out = [];
  for (let s = 0; s < total; s += HOP) {
    const e = s + WINDOW;
    const inside = cues.filter((c) => c.end > s && c.start < e);
    if (!inside.length) continue;
    out.push({ start: s, end: e, terms: new Set(tokens(inside.map((c) => c.text).join(' '))) });
  }
  return out;
}

// -------------------------------------------------------- الدرجة ---------
// الكلمة التي تتكرّر في كل الفيديو لا تدلّ على موضع؛ والكلمة النادرة تدلّ.
function idfTable(windows) {
  const df = new Map();
  for (const w of windows) for (const t of w.terms) df.set(t, (df.get(t) || 0) + 1);
  const N = windows.length || 1;
  const idf = new Map();
  for (const [t, n] of df) idf.set(t, Math.log(1 + N / n));
  return idf;
}

function best(stem, answer, windows, idf) {
  const weight = (t) => idf.get(t) ?? Math.log(1 + (windows.length || 1));
  const cover = (terms, w) => {
    if (!terms.length) return { r: 0, hit: [] };
    const hit = terms.filter((t) => w.terms.has(t));
    const total = terms.reduce((a, t) => a + weight(t), 0) || 1;
    return { r: hit.reduce((a, t) => a + weight(t), 0) / total, hit };
  };
  let top = { score: 0, start: null, hit: [] };
  for (const w of windows) {
    const s = cover(stem, w), a = cover(answer, w);
    const score = W_STEM * s.r + W_ANSWER * a.r;
    if (score > top.score) top = { score, start: w.start, hit: [...new Set([...s.hit, ...a.hit])] };
  }
  return top;
}

const hms = (s) => s == null ? '—'
  : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------- التشغيل ------
const course = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/copilot_course.json'), 'utf8'));
const cues = parseTranscript(fs.readFileSync(SRC, 'utf8'));
if (!cues.length) { console.error('✗ لم أتعرّف على أي طابع زمني في ملف التفريغ.'); process.exit(1); }
const windows = buildWindows(cues);
const idf = idfTable(windows);

const lessonOf = new Map();                       // كفاية → رقم الدرس
for (const l of course.lessons) for (const c of l.competencies) lessonOf.set(c, l.no);
const lessonAt = (sec) => (course.lessons.find((l) => sec >= l.start_sec && sec < l.end_sec) || {}).no ?? null;
const compName = Object.fromEntries(course.competencies.map((c) => [c.id, c.ar]));

const all = [];
const push = (q, origin, expectLesson) => all.push({ ...q, origin, expectLesson });
for (const q of course.assessments.pre.questions) push(q, 'قبلي', lessonOf.get(q.competency));
for (const [no, quiz] of Object.entries(course.assessments.lesson_quizzes))
  for (const q of (Array.isArray(quiz) ? quiz : quiz.questions)) push(q, `درس ${no}`, Number(no));
for (const q of course.assessments.post.questions) push(q, 'بعدي', lessonOf.get(q.competency));

const rows = all.map((q) => {
  const stem = [...new Set(tokens(q.stem_ar))];
  const answer = [...new Set(tokens(q.options_ar[q.answer]))];
  const terms = [...new Set([...stem, ...answer])];
  const b = best(stem, answer, windows, idf);
  const at = b.score >= WEAK ? b.start : null;
  // النافذة تُنسب إلى منتصفها لا إلى بدايتها، وإلا عُدّت نافذة تعبر حدّ الدرس
  // خارجةً عنه بلا سبب.
  const found = at == null ? null : lessonAt(at + WINDOW / 2);
  return {
    id: q.id, origin: q.origin, competency: q.competency, stem: q.stem_ar,
    expectLesson: q.expectLesson, foundLesson: found, at, score: Number(b.score.toFixed(3)),
    matched: b.hit, missed: terms.filter((t) => !b.hit.includes(t)),
    verdict: b.score >= STRONG ? 'مدعوم' : b.score >= WEAK ? 'دعم ضعيف' : 'غير مدعوم',
    placement: at == null ? '—' : found === q.expectLesson ? 'في موضعه' : `في الدرس ${found ?? '؟'}`,
  };
});

// ------------------------------------------------------------ التقرير ----
const count = (v) => rows.filter((r) => r.verdict === v).length;
const misplaced = rows.filter((r) => r.at != null && r.foundLesson !== r.expectLesson);
const comps = course.competencies.map((c) => {
  const mine = rows.filter((r) => r.competency === c.id);
  return { id: c.id, ar: c.ar, lesson: lessonOf.get(c.id), n: mine.length,
           top: Math.max(0, ...mine.map((r) => r.score)) };
});

// حدود مقترَحة: المدى الزمني الذي تقع فيه أسئلة كل درس فعلًا
const suggested = course.lessons.map((l) => {
  const hits = rows.filter((r) => r.expectLesson === l.no && r.at != null).map((r) => r.at).sort((a, b) => a - b);
  return { no: l.no, title: l.title_ar, now: [l.start_sec, l.end_sec],
           seen: hits.length ? [hits[0], hits[hits.length - 1]] : null, n: hits.length };
});

const md = [];
md.push('# محاذاة بنك الأسئلة مع نصّ الفيديو', '');
md.push(`> مصدر التفريغ: \`${path.basename(SRC)}\` · ${cues.length} مقطعًا · ` +
        `مدّة ${hms(cues[cues.length - 1].end)} · نافذة ${WINDOW}ث بخطوة ${HOP}ث`, '');
md.push('الأداة ترجيحية: تُقارن كلمات السؤال وإجابته الصحيحة بكلمات الفيديو وترجّح الموضع.',
        'فهي تُرتّب المراجعة ولا تُغني عنها. وكل سطر يحمل الموضع الزمني كي تُراجَع الحالة في ثوانٍ.', '');
md.push('## الخلاصة', '');
md.push('| الحكم | العدد |', '|---|---|');
md.push(`| مدعوم (≥ ${STRONG}) | ${count('مدعوم')} |`);
md.push(`| دعم ضعيف | ${count('دعم ضعيف')} |`);
md.push(`| **غير مدعوم** | **${count('غير مدعوم')}** |`);
md.push(`| في غير درسه | ${misplaced.length} |`, '');

const unsupported = rows.filter((r) => r.verdict === 'غير مدعوم');
if (unsupported.length) {
  md.push('## أسئلة لا يدعمها الفيديو — تُعدَّل أو تُحذف', '');
  md.push('| السؤال | المصدر | الكفاية | الدرجة | كلمات لم تَرِد في الفيديو |', '|---|---|---|---|---|');
  for (const r of unsupported)
    md.push(`| ${r.id} | ${r.origin} | ${r.competency} | ${r.score} | ${r.missed.slice(0, 8).join('، ')} |`);
  md.push('');
}

if (misplaced.length) {
  md.push('## أسئلة موضعها في الفيديو يخالف درسها', '');
  md.push('| السؤال | درسه | وُجد في | الموضع | الدرجة |', '|---|---|---|---|---|');
  for (const r of misplaced)
    md.push(`| ${r.id} | ${r.expectLesson ?? '—'} | ${r.foundLesson ?? '؟'} | ${hms(r.at)} | ${r.score} |`);
  md.push('');
}

md.push('## كل الأسئلة', '');
md.push('| السؤال | المصدر | الحكم | الموضع | الدرجة | الموضع من الدرس |', '|---|---|---|---|---|---|');
for (const r of rows)
  md.push(`| ${r.id} | ${r.origin} | ${r.verdict} | ${hms(r.at)} | ${r.score} | ${r.placement} |`);
md.push('');

md.push('## تغطية الكفايات', '');
md.push('| الكفاية | الدرس | الأسئلة | أعلى درجة |', '|---|---|---|---|');
for (const c of comps)
  md.push(`| ${c.id} — ${c.ar} | ${c.lesson} | ${c.n} | ${c.top.toFixed(3)} |`);
md.push('');

md.push('## حدود الدروس', '');
md.push('العمود الأخير يبيّن أين تقع أسئلة كل درس فعلًا في الفيديو — فإن خرج عن حدّ',
        'الدرس فالحدّ أو السؤال أحدهما في غير موضعه. وهو مؤشّر لا قرار.', '');
md.push('| الدرس | الحدّ الحالي | مدى أسئلته في الفيديو | عدد |', '|---|---|---|---|');
for (const s of suggested)
  md.push(`| ${s.no} — ${s.title} | ${hms(s.now[0])}–${hms(s.now[1])} | ` +
          `${s.seen ? `${hms(s.seen[0])}–${hms(s.seen[1])}` : '—'} | ${s.n} |`);
md.push('');

const outMd = path.join(__dirname, '../content/alignment_report.md');
const outJson = path.join(__dirname, '../content/alignment.json');
fs.writeFileSync(outMd, md.join('\n'));
fs.writeFileSync(outJson, JSON.stringify({ source: path.basename(SRC), window: WINDOW, hop: HOP,
  strong: STRONG, weak: WEAK, rows, competencies: comps, lessons: suggested }, null, 1));

console.log(`مدعوم ${count('مدعوم')} · ضعيف ${count('دعم ضعيف')} · غير مدعوم ${count('غير مدعوم')} ` +
            `· في غير درسه ${misplaced.length}`);
console.log(`التقرير: ${outMd}`);
