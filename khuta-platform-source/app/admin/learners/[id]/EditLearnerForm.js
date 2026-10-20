'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function EditLearnerForm({ learner }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [status, setStatus] = useState(learner.status);
  const [confirmStop, setConfirmStop] = useState(false);

  async function patch(body, okText) {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await fetch(`/api/admin/learners/${learner.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok) {
        setStatus(j.learner.status);
        setMsg(okText);
        router.refresh();
      } else setErr(j.error || 'تعذّر الحفظ.');
    } catch {
      setErr('تعذّر الاتصال بالخادم.');
    } finally {
      setBusy(false);
      setConfirmStop(false);
    }
  }

  function save(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    patch({
      fullNameAr: f.get('fullNameAr'),
      employeeNo: f.get('employeeNo'),
      department: f.get('department'),
      jobTitle: f.get('jobTitle'),
    }, 'حُفظت البيانات.');
  }

  return (
    <>
      <form onSubmit={save} className="card" style={{ marginBottom: 16 }}>
        {err ? <div className="alert" data-testid="error">{err}</div> : null}
        {msg ? <div className="note" style={{ marginBottom: 14 }} data-testid="saved">{msg}</div> : null}

        <div className="grid g3">
          <label className="field">
            <span>الاسم بالعربية</span>
            <input name="fullNameAr" defaultValue={learner.full_name_ar || ''} required
                   autoComplete="off" data-testid="e-name" />
          </label>
          <label className="field">
            <span>الرقم الوظيفي</span>
            <input name="employeeNo" defaultValue={learner.employee_no || ''} dir="ltr"
                   autoComplete="off" data-testid="e-emp" />
          </label>
          <label className="field">
            <span>الإدارة</span>
            <input name="department" defaultValue={learner.department || ''}
                   autoComplete="off" data-testid="e-dept" />
          </label>
          <label className="field">
            <span>المسمّى الوظيفي</span>
            <input name="jobTitle" defaultValue={learner.job_title || ''}
                   autoComplete="off" data-testid="e-title" />
          </label>
        </div>

        <p className="tiny muted" style={{ marginBottom: 14 }}>
          البريد <span className="ltr">{learner.email}</span> لا يُعدَّل: هو هويّة الحساب
          ومرجع سجلّ التدقيق. من أراد بريدًا جديدًا فحساب جديد.
        </p>

        <button className="btn gold" disabled={busy} data-testid="e-save">
          {busy ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
        </button>
      </form>

      <div className="card">
        <div className="between">
          <div>
            <h3 style={{ marginBottom: 4 }}>حالة الحساب</h3>
            <p className="tiny muted" style={{ margin: 0 }}>
              {status === 'suspended'
                ? 'موقوف — لا يستطيع الدخول، وجلساته أُبطلت.'
                : 'نشط — يستطيع الدخول ومتابعة دورته.'}
            </p>
          </div>
          <span className={`pill${status === 'suspended' ? '' : ' ok'}`} data-testid="e-status">
            {status === 'suspended' ? 'موقوف' : 'نشط'}
          </span>
        </div>

        <div style={{ marginTop: 14 }}>
          {status === 'suspended' ? (
            <button className="btn" disabled={busy} data-testid="e-activate"
                    onClick={() => patch({ status: 'active' }, 'أُعيد تفعيل الحساب.')}>
              إعادة التفعيل
            </button>
          ) : confirmStop ? (
            <div className="tiny">
              <span>يُمنع من الدخول وتُبطل جلساته. تقدّمه ودرجاته تبقى. </span>
              <button className="linkbtn" disabled={busy} data-testid="e-suspend-yes"
                      onClick={() => patch({ status: 'suspended' }, 'أُوقف الحساب.')}>
                أوقِف الحساب
              </button>
              <span className="muted"> · </span>
              <button className="linkbtn" onClick={() => setConfirmStop(false)}>إلغاء</button>
            </div>
          ) : (
            <button className="btn" disabled={busy} data-testid="e-suspend"
                    onClick={() => setConfirmStop(true)}>
              إيقاف الحساب
            </button>
          )}
        </div>
      </div>
    </>
  );
}
