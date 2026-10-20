'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Mark from '../../../components/Mark';
import { GovStrip } from '../../../components/Chrome';

export default function Mfa() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await fetch('/api/auth/mfa', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (j.ok) router.push(j.next);
    else { setError(j.message || 'الرمز غير صحيح.'); setCode(''); }
  }

  return (
    <>
      <GovStrip />
      <main className="wrap">
        <form className="signin card" onSubmit={submit} noValidate>
          <Mark size={76} className="mk" />
          <h1>التحقّق بخطوتين</h1>
          <p className="sub">أدخل الرمز المعروض في تطبيق المصادقة على هاتفك</p>

          {error ? <div className="alert" role="alert">{error}</div> : null}

          <label className="field">
            <span>الرمز المكوّن من ستة أرقام</span>
            <input className="code" inputMode="numeric" autoComplete="one-time-code"
                   maxLength={6} pattern="\d{6}" required name="code"
                   value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>

          <button className="btn block" disabled={busy || code.length !== 6}>
            {busy ? 'جارٍ التحقّق…' : 'تأكيد'}
          </button>
          <p className="tiny" style={{ marginTop: 14, textAlign: 'center' }}>
            يتغيّر الرمز كل ثلاثين ثانية. أمامك خمس دقائق لإتمام الدخول.
          </p>
        </form>
      </main>
    </>
  );
}
