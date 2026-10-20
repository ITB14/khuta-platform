'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function NewLearnerForm({ courses }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [made, setMade] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(f.entries());
    try {
      const r = await fetch('/api/admin/learners', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok) setMade(j); else setErr(j.error || 'تعذّر إنشاء الحساب.');
    } catch {
      setErr('تعذّر الاتصال بالخادم.');
    } finally {
      setBusy(false);
    }
  }

  // بعد الإنشاء: بيانات الدخول مرّة واحدة. لا تُعرض ثانيةً ولا تُستخرج من
  // قاعدة البيانات، فالصفحة تقول ذلك صراحةً بدل أن يكتشفه المسؤول لاحقًا.
  if (made) {
    return (
      <>
        <div className="cert" data-testid="credentials">
          <h3 style={{ marginBottom: 10 }}>أُنشئ حساب {made.fullNameAr}</h3>
          <p style={{ marginBottom: 12 }}>
            سلّم هذه البيانات للمتعلّم الآن. <b>لن تظهر مرّة أخرى</b> — كلمة المرور
            مخزَّنة مجزّأة، وسرّ المصادقة مخزَّن مشفّرًا، ولا يُستردّ أيّهما.
          </p>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', margin: 0 }}>
            <dt className="tiny">البريد</dt>
            <dd className="ltr num" style={{ margin: 0 }}>{made.email}</dd>
            <dt className="tiny">كلمة المرور</dt>
            <dd className="ltr num" style={{ margin: 0, fontWeight: 700 }}>{made.password}</dd>
            <dt className="tiny">سرّ المصادقة الثنائية</dt>
            <dd className="ltr num" style={{ margin: 0, wordBreak: 'break-all' }}>{made.mfaSecret}</dd>
          </dl>
          <p className="tiny" style={{ marginTop: 12 }}>
            يُضاف السرّ في تطبيق المصادقة (Microsoft Authenticator أو ما يماثله)
            بإدخاله يدويًّا باسم الحساب نفسه.
          </p>
        </div>

        <div className="between" style={{ marginTop: 16 }}>
          <Link className="btn gold" href="/admin">عودة إلى المتعلّمين</Link>
          <button className="btn" onClick={() => setMade(null)}>إضافة متعلّم آخر</button>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={submit} className="card">
      {err ? <div className="alert" data-testid="error">{err}</div> : null}

      <div className="grid g3">
        <label className="field">
          <span>الاسم بالعربية</span>
          <input name="fullNameAr" required autoComplete="off" data-testid="f-name" />
        </label>
        <label className="field">
          <span>البريد الإلكتروني</span>
          <input name="email" type="email" required dir="ltr" autoComplete="off" data-testid="f-email" />
        </label>
        <label className="field">
          <span>الرقم الوظيفي</span>
          <input name="employeeNo" dir="ltr" autoComplete="off" data-testid="f-emp" />
        </label>
        <label className="field">
          <span>الإدارة</span>
          <input name="department" autoComplete="off" data-testid="f-dept" />
        </label>
        <label className="field">
          <span>المسمّى الوظيفي</span>
          <input name="jobTitle" autoComplete="off" data-testid="f-title" />
        </label>
        <label className="field">
          <span>الدفعة</span>
          <input name="cohort" defaultValue="Q1-2027" autoComplete="off" data-testid="f-cohort" />
        </label>
        <label className="field">
          <span>الدورة</span>
          <select name="courseCode" className="field" data-testid="f-course"
                  style={{ width: '100%', padding: '11px 13px', borderRadius: 8 }}>
            {courses.map((c) => <option key={c.code} value={c.code}>{c.title_ar}</option>)}
          </select>
        </label>
        <label className="field">
          <span>المهلة بالأيام</span>
          <input name="dueDays" type="number" min="1" max="365" defaultValue="21"
                 dir="ltr" data-testid="f-due" />
        </label>
      </div>

      <div className="note" style={{ marginBottom: 14 }}>
        تُولَّد كلمة مرور عشوائية وتُسجَّل المصادقة الثنائية تلقائيًّا، وتُعرض
        بياناتهما مرّة واحدة بعد الإنشاء.
      </div>

      <button className="btn gold" disabled={busy} data-testid="submit">
        {busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب والتسجيل'}
      </button>
    </form>
  );
}
