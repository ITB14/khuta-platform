'use client';
import { useState } from 'react';

export default function SkillsEditor({ initial }) {
  const [rows, setRows] = useState(initial);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const r = await fetch('/api/admin/skills');
    const j = await r.json().catch(() => ({}));
    if (j.ok) setRows(j.skills);
  }

  async function add(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch('/api/admin/skills', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(f.entries())),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { setErr(j.error || 'تعذّرت الإضافة.'); return; }
      e.target.reset();
      await reload();
    } catch { setErr('تعذّر الاتصال بالخادم.'); }
    finally { setBusy(false); }
  }

  async function toggle(id, isActive) {
    setErr(null); setBusy(true);
    try {
      const r = await fetch(`/api/admin/skills/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { setErr(j.error || 'تعذّر التعديل.'); return; }
      await reload();
    } catch { setErr('تعذّر الاتصال بالخادم.'); }
    finally { setBusy(false); }
  }

  return (
    <>
      {err ? <div className="alert" data-testid="skill-admin-error">{err}</div> : null}

      <form onSubmit={add} className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 10 }}>إضافة مهارة</h3>
        <div className="grid g3">
          <label className="field">
            <span>الاسم بالعربية</span>
            <input name="nameAr" required autoComplete="off" data-testid="sk-name" />
          </label>
          <label className="field">
            <span>الاسم بالإنجليزية</span>
            <input name="nameEn" dir="ltr" autoComplete="off" data-testid="sk-name-en" />
          </label>
          <label className="field">
            <span>التصنيف</span>
            <input name="category" autoComplete="off" data-testid="sk-cat"
                   placeholder="أدوات مكتبية، تحليل، إدارة…" />
          </label>
        </div>
        <button className="btn gold" disabled={busy} data-testid="sk-add">
          {busy ? 'جارٍ…' : 'إضافة'}
        </button>
      </form>

      <div className="card">
        {rows.length === 0 ? (
          <p className="muted">لا مهارات بعد. أضف أولاها من الأعلى، ثم يعلن الموظفون عنها من ملفّاتهم.</p>
        ) : (
          <table className="gain" data-testid="skills-table">
            <thead>
              <tr>
                <th>المهارة</th><th>التصنيف</th>
                <th>يريد تعلّمها</th><th>يتعلّمها</th><th>يتقنها</th>
                <th>أكثر إدارة تطلبها</th><th>الحالة</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.skill_id} style={s.is_active ? undefined : { opacity: 0.6 }}>
                  <td><b>{s.name_ar}</b></td>
                  <td className="tiny">{s.category || '—'}</td>
                  <td className={`num ${s.wants > 0 ? 'up' : 'flat'}`}>{s.wants || '—'}</td>
                  <td className="num">{s.learning || '—'}</td>
                  <td className="num">{s.has || '—'}</td>
                  <td className="tiny">
                    {s.top_department
                      ? <>{s.top_department} <span className="muted">({s.top_wants})</span></>
                      : '—'}
                  </td>
                  <td>
                    <span className={`pill${s.is_active ? ' ok' : ''}`}>
                      {s.is_active ? 'مفعّلة' : 'معطّلة'}
                    </span>
                  </td>
                  <td>
                    <button className="linkbtn" disabled={busy}
                            onClick={() => toggle(s.skill_id, !s.is_active)}
                            data-testid={`sk-toggle-${s.skill_id}`}>
                      {s.is_active ? 'تعطيل' : 'تفعيل'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
