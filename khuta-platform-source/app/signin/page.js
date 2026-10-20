'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Mark from '../../components/Mark';
import { GovStrip } from '../../components/Chrome';

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await fetch('/api/auth/signin', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (j.ok) router.push(j.next); else setError(j.message || 'تعذّر تسجيل الدخول.');
  }

  return (
    <>
      <GovStrip />
      <main className="wrap">
        <form className="signin card" onSubmit={submit} noValidate>
          <Mark size={76} className="mk" />
          <h1>تسجيل الدخول</h1>
          <p className="sub">منصة التعلّم المؤسسي لموظفي بلدية مدينة العين</p>

          {error ? <div className="alert" role="alert">{error}</div> : null}

          <label className="field">
            <span>البريد الإلكتروني</span>
            <input type="email" name="email" autoComplete="username" dir="ltr" required
                   value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>كلمة المرور</span>
            <input type="password" name="password" autoComplete="current-password" required
                   value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>

          <button className="btn block" disabled={busy || !email || !password}>
            {busy ? 'جارٍ التحقّق…' : 'دخول'}
          </button>
          <p className="tiny" style={{ marginTop: 14, textAlign: 'center' }}>
            يُقفل الحساب مؤقتًا بعد خمس محاولات فاشلة.
          </p>
        </form>
      </main>
    </>
  );
}
