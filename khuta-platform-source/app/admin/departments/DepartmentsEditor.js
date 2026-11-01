'use client';
import { useState } from 'react';

export default function DepartmentsEditor({ initial }) {
  const [rows, setRows] = useState(initial);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);     // id قيد التعديل
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState(null);

  async function reload() {
    const r = await fetch('/api/admin/departments');
    const j = await r.json().catch(() => ({}));
    if (j.ok) setRows(j.departments);
  }

  async function add(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(f.entries());
    try {
      const r = await fetch('/api/admin/departments', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { setErr(j.error || 'تعذّرت الإضافة.'); return; }
      e.target.reset();
      await reload();
    } catch { setErr('تعذّر الاتصال بالخادم.'); }
    finally { setBusy(false); }
  }

  async function patch(id, body) {
    setErr(null); setBusy(true);
    try {
      const r = await fetch(`/api/admin/departments/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { setErr(j.error || 'تعذّر التعديل.'); return false; }
      await reload();
      return true;
    } catch { setErr('تعذّر الاتصال بالخادم.'); return false; }
    finally { setBusy(false); }
  }

  const parents = rows.filter((d) => !d.parent_id && d.is_active);

  async function merge(id, intoId) {
    if (!intoId) return;
    setErr(null); setBusy(true);
    try {
      const r = await fetch(`/api/admin/departments/${id}/merge`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intoId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { setErr(j.error || 'تعذّر الدمج.'); return; }
      setNote(`نُقل ${j.moved} موظفًا من «${j.fromName}» إلى «${j.intoName}»، وعُطّلت الأولى.`);
      await reload();
    } catch { setErr('تعذّر الاتصال بالخادم.'); }
    finally { setBusy(false); }
  }

  return (
    <>
      {err ? <div className="alert" data-testid="dept-error">{err}</div> : null}
      {note ? <div className="note ok" data-testid="dept-note">{note}</div> : null}

      <form onSubmit={add} className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 10 }}>إضافة إدارة</h3>
        <div className="grid g3">
          <label className="field">
            <span>الاسم بالعربية</span>
            <input name="nameAr" required autoComplete="off" data-testid="d-name" />
          </label>
          <label className="field">
            <span>الاسم بالإنجليزية</span>
            <input name="nameEn" dir="ltr" autoComplete="off" data-testid="d-name-en" />
          </label>
          <label className="field">
            <span>الرمز</span>
            <input name="code" dir="ltr" autoComplete="off" data-testid="d-code" />
          </label>
          <label className="field">
            <span>تتبع قطاعًا</span>
            <select name="parentId" data-testid="d-parent"
                    style={{ width: '100%', padding: '11px 13px', borderRadius: 8,
                             border: '1px solid var(--line)' }}>
              <option value="">— قطاع مستقلّ —</option>
              {parents.map((p) => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
            </select>
          </label>
        </div>
        <button className="btn gold" disabled={busy} data-testid="d-add">
          {busy ? 'جارٍ…' : 'إضافة'}
        </button>
      </form>

      <div className="card">
        {rows.length === 0 ? (
          <p className="muted">لا إدارات بعد. أضف أولاها من الأعلى.</p>
        ) : (
          <table className="gain" data-testid="dept-table">
            <thead>
              <tr>
                <th>الإدارة</th><th>تتبع</th><th>الرمز</th>
                <th>الموظفون</th><th>الحالة</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} style={d.is_active ? undefined : { opacity: 0.6 }}>
                  <td>
                    {editing === d.id ? (
                      <input value={draft} onChange={(e) => setDraft(e.target.value)}
                             data-testid={`d-edit-${d.id}`} style={{ width: '100%' }} />
                    ) : (
                      <>
                        <b>{d.name_ar}</b>
                        {d.name_en ? <div className="tiny ltr muted">{d.name_en}</div> : null}
                      </>
                    )}
                  </td>
                  <td>{d.parent_name || <span className="muted">—</span>}</td>
                  <td className="ltr tiny">{d.code || '—'}</td>
                  <td className="num">{d.learners}</td>
                  <td>
                    <span className={`pill${d.is_active ? ' ok' : ''}`}>
                      {d.is_active ? 'مفعّلة' : 'معطّلة'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center',
                                  flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {editing === d.id ? (
                        <>
                          <button className="linkbtn" disabled={busy}
                                  onClick={async () => {
                                    if (await patch(d.id, { nameAr: draft })) setEditing(null);
                                  }} data-testid={`d-save-${d.id}`}>حفظ</button>
                          <button className="linkbtn" onClick={() => setEditing(null)}>إلغاء</button>
                        </>
                      ) : (
                        <>
                          <button className="linkbtn"
                                  onClick={() => { setEditing(d.id); setDraft(d.name_ar); }}
                                  data-testid={`d-rename-${d.id}`}>إعادة تسمية</button>
                          <button className="linkbtn" disabled={busy}
                                  onClick={() => patch(d.id, { isActive: !d.is_active })}
                                  data-testid={`d-toggle-${d.id}`}>
                            {d.is_active ? 'تعطيل' : 'تفعيل'}
                          </button>
                          {/* الدمج هو ما يُصلح ما سبق الجدول: إدارتان كُتبتا
                              باسمين وهما واحدة. ولا يظهر إلا حيث له معنى. */}
                          {d.is_active && d.learners > 0 ? (
                            <select defaultValue="" disabled={busy}
                                    data-testid={`d-merge-${d.id}`}
                                    onChange={(e) => { merge(d.id, e.target.value); e.target.value = ''; }}
                                    style={{ fontSize: 12.5, padding: '4px 6px',
                                             borderRadius: 6, border: '1px solid var(--line)' }}>
                              <option value="">دمج في…</option>
                              {rows.filter((o) => o.id !== d.id && o.is_active)
                                   .map((o) => <option key={o.id} value={o.id}>{o.name_ar}</option>)}
                            </select>
                          ) : null}
                        </>
                      )}
                    </div>
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
