'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ChangePasswordForm({ forced }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    const f = new FormData(e.currentTarget);
    const newPassword = String(f.get('newPassword') || '');
    if (newPassword !== String(f.get('confirm') || '')) {
      setErr('الكلمتان الجديدتان غير متطابقتين.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: f.get('currentPassword'), newPassword }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok) { router.push(j.next || '/dashboard'); router.refresh(); }
      else setErr(j.error || 'تعذّر تغيير كلمة المرور.');
    } catch {
      setErr('تعذّر الاتصال بالخادم.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card">
      {err ? <div className="alert" data-testid="error">{err}</div> : null}

      {forced ? (
        <div className="note" style={{ marginBottom: 16 }} data-testid="forced">
          كلمة مرورك الحالية مؤقّتة وضعها غيرك. اخترْ كلمة يعرفها أنت وحدك قبل
          المتابعة — لن تُفتح لك الدروس قبل ذلك.
        </div>
      ) : null}

      <label className="field">
        <span>كلمة المرور الحالية</span>
        <input name="currentPassword" type="password" required dir="ltr"
               autoComplete="current-password" data-testid="f-current" />
      </label>
      <label className="field">
        <span>كلمة المرور الجديدة</span>
        <input name="newPassword" type="password" required dir="ltr" minLength={12}
               autoComplete="new-password" data-testid="f-new" />
      </label>
      <label className="field">
        <span>تأكيد الكلمة الجديدة</span>
        <input name="confirm" type="password" required dir="ltr" minLength={12}
               autoComplete="new-password" data-testid="f-confirm" />
      </label>

      <p className="tiny muted" style={{ marginBottom: 14 }}>
        اثنا عشر محرفًا على الأقل، وفيها حرف صغير وحرف كبير ورقم.
      </p>

      <button className="btn gold block" disabled={busy} data-testid="submit">
        {busy ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}
      </button>

      <p className="tiny muted" style={{ marginTop: 12 }}>
        بعد الحفظ تُغلق جلساتك على الأجهزة الأخرى.
      </p>
    </form>
  );
}
