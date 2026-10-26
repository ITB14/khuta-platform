'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// اختبار الشهادة في النمط المفتوح: سؤال واحد على الشاشة، يُصحَّح لحظة الإجابة.
// الخطأ لا يُنهي شيئًا — يُظهر الصواب وشرحه، ويبقى السؤال مفتوحًا حتى يُصاب.
export default function FinalQuiz({ slug, total }) {
  const router = useRouter();
  const started = useRef(false);
  const [phase, setPhase] = useState('loading');   // loading | answering | sending | done | blocked
  const [reason, setReason] = useState(null);
  const [attemptId, setAttemptId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [i, setI] = useState(0);
  const [fb, setFb] = useState(null);              // { correct, correctOptionId, explain, picked }
  const [error, setError] = useState(null);

  useEffect(() => {
    if (started.current) return;                   // React يشغّل التأثير مرّتين في التطوير
    started.current = true;
    (async () => {
      const r = await fetch('/api/assessment/start', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { setReason(j.reason); setPhase('blocked'); return; }
      setAttemptId(j.attemptId);
      setQuestions(j.questions);
      // الاستئناف يبدأ من أول سؤال لم يُصَب، لا من الأول دائمًا.
      const next = j.questions.findIndex((q) => !q.resolved);
      setI(next === -1 ? 0 : next);
      setPhase('answering');
    })();
  }, [slug]);

  const q = questions[i];
  const solved = questions.filter((x) => x.resolved).length;

  async function pick(o) {
    if (phase !== 'answering' || !q || q.resolved) return;
    setPhase('sending'); setError(null);
    const r = await fetch(`/api/attempt/${attemptId}/answer`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ questionId: q.id, optionId: o.id }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) {
      setPhase('answering');
      setError('تعذّر حفظ الإجابة. تحقّق من الاتصال وأعد المحاولة.');
      return;
    }
    setFb({ correct: j.correct, correctOptionId: j.correctOptionId, explain: j.explain, picked: o.id });
    if (j.correct) {
      setQuestions((qs) => qs.map((x, n) => (n === i ? { ...x, resolved: true } : x)));
    }
    setPhase('answering');
  }

  // التالي هو أوّل سؤال غير مكتمل بعد الحالي، ثم يلتفّ إلى أوله — فلا يقفز
  // المتعلّم إلى الوراء ولا يعلق في سؤال أتمّه.
  function next() {
    setFb(null);
    for (let k = 1; k <= questions.length; k++) {
      const n = (i + k) % questions.length;
      if (!questions[n].resolved) { setI(n); return; }
    }
    finish();
  }

  async function finish() {
    setPhase('sending');
    const r = await fetch(`/api/attempt/${attemptId}/submit`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) { setPhase('answering'); setError('تعذّر إنهاء الاختبار. أعد المحاولة.'); return; }
    setPhase('done');
    router.push(`/result/${attemptId}`);
  }

  if (phase === 'loading') return <div className="card"><p className="muted">جارٍ فتح الاختبار…</p></div>;
  if (phase === 'blocked') {
    return <div className="card"><div className="alert" data-testid="gate">
      تعذّر فتح هذا الاختبار ({reason}).</div></div>;
  }
  if (!q) return <div className="card"><p className="muted">لا أسئلة.</p></div>;

  const allResolved = questions.every((x) => x.resolved);

  return (
    <div data-testid="final-quiz">
      <div className="between" style={{ marginBottom: 6 }}>
        <span className="tiny">السؤال {i + 1} من {total}</span>
        <span className="tiny num" data-testid="solved">{solved} مكتملة</span>
      </div>
      <div className="bar" style={{ marginBottom: 16 }}>
        <i style={{ width: `${(solved / total) * 100}%` }} />
      </div>

      {error ? <div className="alert" data-testid="save-error">{error}</div> : null}

      <div className="q" data-testid={`q-${q.externalId}`}>
        <div className="qh">
          <span className="qn num">{i + 1}</span>
          <span className="qs">{q.stem}</span>
        </div>
        {q.options.map((o) => {
          const right = fb && fb.correctOptionId === o.id;
          const wrong = fb && !fb.correct && fb.picked === o.id;
          return (
            <button key={o.id} type="button"
                    className={`opt${right ? ' right' : ''}${wrong ? ' wrong' : ''}`}
                    disabled={phase === 'sending' || q.resolved}
                    onClick={() => pick(o)}
                    data-testid={`opt-${q.externalId}-${o.label}`}>
              <span className="ab">{o.label}</span><span>{o.text}</span>
              {right ? <span className="mark">الإجابة الصحيحة</span> : null}
            </button>
          );
        })}
      </div>

      {fb && !fb.correct ? (
        <div className="note" data-testid="reveal">
          <p style={{ marginBottom: 6 }}><strong>ليست هذه.</strong> {fb.explain}</p>
          <p className="tiny">اختر الإجابة الصحيحة أعلاه للمتابعة.</p>
        </div>
      ) : null}

      {/* استئناف بعد إتمام الأسئلة كلّها وقبل الإنهاء: لولا هذا لعاد المتعلّم
          إلى سؤال أتمّه، بخياراته معطّلة وبلا زرّ — طريق مسدود لا مخرج منه. */}
      {!fb && allResolved ? (
        <div className="note ok" data-testid="resume-finish">
          <p style={{ marginBottom: 10 }}><strong>أتممت الأسئلة كلّها.</strong></p>
          <button className="btn gold" onClick={finish}
                  disabled={phase === 'sending'} data-testid="next">
            أنهِ واحصل على الشهادة
          </button>
        </div>
      ) : null}

      {fb && fb.correct ? (
        <div className="note ok" data-testid="correct">
          <p style={{ marginBottom: 10 }}><strong>إجابة صحيحة.</strong></p>
          <button className="btn gold" onClick={allResolved ? finish : next}
                  disabled={phase === 'sending'} data-testid="next">
            {allResolved ? 'أنهِ واحصل على الشهادة' : 'السؤال التالي'}
          </button>
        </div>
      ) : null}

      <p className="tiny" style={{ marginTop: 14 }}>
        لا حدّ للمحاولات ولا عقوبة على الخطأ. التصحيح كلّه يجري على الخادم،
        والصفحة لا تعرف الإجابة قبل أن تُجيب.
      </p>
    </div>
  );
}
