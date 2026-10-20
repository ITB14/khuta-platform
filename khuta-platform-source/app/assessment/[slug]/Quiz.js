'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Quiz({ slug, total, kind }) {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState({ phase: 'loading' });
  const [questions, setQuestions] = useState([]);
  const [chosen, setChosen] = useState({});
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (started.current) return;              // React runs effects twice in dev
    started.current = true;
    (async () => {
      const r = await fetch('/api/assessment/start', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { setState({ phase: 'blocked', reason: j.reason }); return; }
      setQuestions(j.questions);
      setChosen(Object.fromEntries(j.questions.filter((q) => q.chosen).map((q) => [q.id, q.chosen])));
      setState({ phase: 'answering', attemptId: j.attemptId, attemptNo: j.attemptNo, resumed: j.resumed });
    })();
  }, [slug]);

  async function pick(q, o) {
    if (state.phase !== 'answering') return;
    const before = chosen[q.id];
    setChosen((c) => ({ ...c, [q.id]: o.id }));   // optimistic, then confirmed
    setSaving(q.id); setError(null);
    const r = await fetch(`/api/attempt/${state.attemptId}/respond`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ questionId: q.id, optionId: o.id }),
    });
    setSaving(null);
    if (!r.ok) {
      setChosen((c) => ({ ...c, [q.id]: before }));
      setError('تعذّر حفظ الإجابة. تحقّق من الاتصال وأعد المحاولة.');
    }
  }

  async function submit() {
    setState((s) => ({ ...s, phase: 'submitting' }));
    const r = await fetch(`/api/attempt/${state.attemptId}/submit`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) {
      setState((s) => ({ ...s, phase: 'answering' }));
      setError('تعذّر تسليم الورقة. أعد المحاولة.');
      return;
    }
    router.push(`/result/${state.attemptId}`);
  }

  const answered = Object.keys(chosen).length;

  if (state.phase === 'loading') return <div className="card"><p className="muted">جارٍ فتح الورقة…</p></div>;
  if (state.phase === 'blocked') {
    return <div className="card"><div className="alert" data-testid="gate">
      تعذّر فتح هذا التقييم ({state.reason}).</div></div>;
  }

  return (
    <div data-testid="quiz">
      {state.resumed ? (
        <div className="note" style={{ marginBottom: 14 }}>
          استُؤنفت محاولة لم تُسلَّم بعد. إجاباتك السابقة محفوظة ولم تُحتسب محاولة جديدة.
        </div>
      ) : null}
      {error ? <div className="alert" data-testid="save-error">{error}</div> : null}

      {questions.map((q, i) => (
        <div className="q" key={q.id} data-testid={`q-${q.externalId}`}>
          <div className="qh">
            <span className="qn num">{i + 1}</span>
            <span className="qs">{q.stem}</span>
          </div>
          {q.options.map((o) => (
            <button key={o.id} type="button"
                    className={`opt${chosen[q.id] === o.id ? ' sel' : ''}`}
                    disabled={state.phase !== 'answering'}
                    onClick={() => pick(q, o)}
                    data-testid={`opt-${q.externalId}-${o.label}`}>
              <span className="ab">{o.label}</span><span>{o.text}</span>
            </button>
          ))}
          {saving === q.id ? <p className="tiny" style={{ marginTop: 6 }}>يُحفظ…</p> : null}
        </div>
      ))}

      <div className="qbar between">
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="between" style={{ marginBottom: 2 }}>
            <span className="tiny">
              {kind === 'pre'
                ? 'لا تُصحَّح الإجابات الآن — تُحفظ للمقارنة بعد الدورة.'
                : 'التصحيح يجري على الخادم بعد التسليم. لا تُعرض الإجابات الصحيحة قبله.'}
            </span>
            <span className="tiny num" data-testid="answered">{answered} من {total}</span>
          </div>
          <div className="bar"><i style={{ width: `${(answered / total) * 100}%` }} /></div>
        </div>
        <button className="btn gold" onClick={submit} data-testid="submit"
                disabled={state.phase !== 'answering'}>
          {state.phase === 'submitting' ? 'يُسلَّم…' : 'تسليم الورقة'}
        </button>
      </div>
      {answered < total ? (
        <p className="tiny" style={{ marginTop: 8 }}>
          تستطيع التسليم قبل الإجابة عن الجميع؛ الأسئلة غير المجابة تُحتسب خاطئة.
        </p>
      ) : null}
    </div>
  );
}
