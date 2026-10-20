'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const BEAT_EVERY_SEC = 10;   // of playback, so it scales with the playback rate

export default function Player({ lesson, enrolmentId, sources, demo }) {
  const router = useRouter();
  const video = useRef(null);
  const lastBeat = useRef(-BEAT_EVERY_SEC);
  const seq = useRef(0);
  const [coverage, setCoverage] = useState(lesson.coverage ?? 0);
  const [log, setLog] = useState([]);
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(!!lesson.completedAt);
  const [rate, setRate] = useState(1);

  const required = lesson.requiredRatio;
  const push = (kind, text) =>
    setLog((l) => [{ kind, text, at: new Date().toLocaleTimeString('ar-AE', { hour12: false }) }, ...l].slice(0, 12));

  useEffect(() => { if (video.current) video.current.playbackRate = rate; }, [rate]);

  async function beat(positionSec) {
    seq.current += 1;
    const r = await fetch(`/api/lesson/${lesson.id}/heartbeat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enrolmentId, positionSec, seq: seq.current }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.ok) {
      setCoverage(j.coverage);
      push('ok', `نبضة ${seq.current} · الموضع ${Math.floor(positionSec)}ث · التغطية ${(j.coverage * 100).toFixed(0)}٪`);
    } else if (j.reason === 'rate') {
      push('err', 'الخادم رفض النبضة — أسرع من الزمن الحقيقي');
    }
  }

  function onTimeUpdate(e) {
    const t = e.target.currentTime;
    if (t - lastBeat.current >= BEAT_EVERY_SEC) { lastBeat.current = t; beat(t); }
  }

  async function complete() {
    setMsg(null);
    const r = await fetch(`/api/lesson/${lesson.id}/complete`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enrolmentId }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.ok) {
      setDone(true);
      push('ok', `الخادم اعتمد الإكمال · التغطية ${(j.coverage * 100).toFixed(0)}٪`);
      // R4: finishing the video opens the quiz, and the quiz opens the lesson
      // after it. The player says so rather than implying the path is clear.
      setMsg({ kind: 'ok', text: 'اكتمل الدرس. اختبار الدرس متاح الآن، واجتيازه هو ما يفتح الدرس التالي.',
        quiz: `/assessment/lesson-${lesson.no}` });
      router.refresh();
    } else if (j.reason === 'insufficient_coverage') {
      push('err', `الخادم رفض الإكمال · ${(j.coverage * 100).toFixed(0)}٪ من ${(j.required * 100).toFixed(0)}٪`);
      setMsg({ kind: 'err', text:
        `لم يُحتسب الدرس مكتملًا: شوهد ${(j.coverage * 100).toFixed(0)}٪ والمطلوب ${(j.required * 100).toFixed(0)}٪.` });
    } else {
      setMsg({ kind: 'err', text: j.reason === 'locked' ? 'هذا الدرس مقفل.' : 'تعذّر إكمال الدرس.' });
    }
  }

  return (
    <>
      <video ref={video} controls playsInline preload="metadata"
             onTimeUpdate={onTimeUpdate} data-testid="player"
             style={{ width: '100%', borderRadius: 10, background: '#0B0B0B', display: 'block' }}>
        {(sources || []).map((s) => <source key={s.type} src={s.src} type={s.type} />)}
      </video>

      <div className="between" style={{ marginTop: 14 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="between" style={{ marginBottom: 2 }}>
            <span className="tiny">التغطية المحسوبة على الخادم</span>
            <span className="tiny num" data-testid="coverage">
              {(coverage * 100).toFixed(0)}٪ من {(required * 100).toFixed(0)}٪
            </span>
          </div>
          <div className="bar"><i style={{ width: `${Math.min(100, coverage * 100)}%` }} /></div>
        </div>
        <button className="btn gold" onClick={complete} disabled={done} data-testid="complete">
          {done ? 'مكتمل' : 'أكملتُ الدرس'}
        </button>
      </div>

      {msg ? (
        <div className={msg.kind === 'ok' ? 'note' : 'alert'} style={{ marginTop: 14 }} data-testid="verdict">
          {msg.text}
          {msg.quiz ? (
            <div style={{ marginTop: 10 }}>
              <a className="btn gold" href={msg.quiz} data-testid="to-quiz">اختبار الدرس</a>
            </div>
          ) : null}
        </div>
      ) : null}

      {demo.on ? (
        <div className="note" style={{ marginTop: 14 }}>
          <b>وضع العرض مُفعّل.</b> يسمح بتشغيل أسرع من الزمن الحقيقي لعرض المسار على اللجنة.
          مسجَّل في سجلّ التدقيق ومطفأ في الإنتاج.{' '}
          {[1, 4, demo.speed].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
            <button key={v} className="linkbtn" style={{ color: 'var(--gold-deep)', marginInlineStart: 8 }}
                    onClick={() => setRate(v)} data-testid={`rate-${v}`}>×{v}</button>
          ))}
          <span className="tiny" style={{ marginInlineStart: 8 }}>السرعة الحالية ×{rate}</span>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 16, background: '#101010', borderColor: '#101010', color: '#D8D4CC' }}>
        <h3 style={{ color: '#fff', fontSize: 14, marginBottom: 8 }}>سجلّ الخادم</h3>
        {log.length === 0 ? (
          <p className="tiny" style={{ color: '#8a8a8a' }}>شغّل الفيديو لترى النبضات كما يستقبلها الخادم.</p>
        ) : log.map((l, i) => (
          <div key={i} style={{ borderTop: '1px solid #262626', padding: '6px 0', display: 'flex', gap: 10, fontSize: 12.5 }}>
            <time style={{ color: '#7C7C7C' }} className="num">{l.at}</time>
            <b style={{ color: l.kind === 'ok' ? '#6FCF97' : '#F2808E' }}>{l.kind === 'ok' ? 'قُبلت' : 'رُفضت'}</b>
            <span style={{ color: '#B9B4AA' }}>{l.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}
