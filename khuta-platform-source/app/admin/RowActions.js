'use client';
import { useState } from 'react';

/**
 * استعادة وصول متعلّم من داخل الصف.
 *
 * خطوتان عمدًا: إبطال جلسات شخص وتغيير كلمته ليس شيئًا يقع بنقرة واحدة
 * بالخطأ على صفّ مجاور.
 */
export default function RowActions({ id, name }) {
  const [stage, setStage] = useState('idle');   // idle · confirm · busy · done · error
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  async function run(withMfa) {
    setStage('busy');
    setErr(null);
    try {
      const r = await fetch(`/api/admin/learners/${id}/reset`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: true, mfa: withMfa }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok) { setOut(j); setStage('done'); }
      else { setErr(j.error || 'تعذّرت العملية.'); setStage('error'); }
    } catch {
      setErr('تعذّر الاتصال بالخادم.');
      setStage('error');
    }
  }

  if (stage === 'done' && out) {
    return (
      <div className="note" style={{ minWidth: 240 }} data-testid={`reset-done-${id}`}>
        <b>سلّمها لـ{name} الآن — لن تظهر ثانيةً.</b>
        <div className="tiny ltr num" style={{ marginTop: 8, wordBreak: 'break-all' }}>
          كلمة المرور: <b>{out.password}</b>
        </div>
        {out.mfaSecret ? (
          <div className="tiny ltr num" style={{ marginTop: 4, wordBreak: 'break-all' }}>
            سرّ المصادقة: <b>{out.mfaSecret}</b>
          </div>
        ) : null}
        <div className="tiny" style={{ marginTop: 8 }}>
          أُبطلت جلساته، ويُطلب منه تغيير الكلمة عند أوّل دخول.
        </div>
      </div>
    );
  }

  return (
    <div style={{ minWidth: 150 }}>
      {stage === 'idle' || stage === 'error' ? (
        <>
          {err ? <div className="tiny" style={{ color: 'var(--err)', marginBottom: 6 }}>{err}</div> : null}
          <button className="linkbtn" onClick={() => setStage('confirm')}
                  data-testid={`reset-${id}`}>استعادة الوصول</button>
        </>
      ) : null}

      {stage === 'confirm' ? (
        <div className="tiny">
          <div style={{ marginBottom: 6 }}>ماذا يُعاد تعيينه؟</div>
          <button className="linkbtn" onClick={() => run(false)}
                  data-testid={`reset-pw-${id}`}>كلمة المرور</button>
          <span className="muted"> · </span>
          <button className="linkbtn" onClick={() => run(true)}
                  data-testid={`reset-both-${id}`}>هي والمصادقة</button>
          <span className="muted"> · </span>
          <button className="linkbtn" onClick={() => setStage('idle')}>إلغاء</button>
        </div>
      ) : null}

      {stage === 'busy' ? <span className="tiny muted">جارٍ…</span> : null}
    </div>
  );
}
