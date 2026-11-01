'use client';
import { useState } from 'react';

const KINDS = {
  category: { title: 'التصنيفات', one: 'تصنيف', ph: 'أدوات العمل الرقمية، السلامة، الامتثال…' },
  provider: { title: 'المزوّدون', one: 'مزوّد', ph: 'الجهة أو المعهد أو الشركة المنتجة' },
};

export default function CatalogueEditor({ initial }) {
  const [data, setData] = useState(initial);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const r = await fetch('/api/admin/catalogue');
    const j = await r.json().catch(() => ({}));
    if (j.ok) setData({ courses: j.courses, categories: j.categories, providers: j.providers });
  }

  async function send(url, body, method = 'POST') {
    setErr(null); setBusy(true);
    try {
      const r = await fetch(url, {
        method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { setErr(j.error || 'تعذّرت العملية.'); return false; }
      await reload();
      return true;
    } catch { setErr('تعذّر الاتصال بالخادم.'); return false; }
    finally { setBusy(false); }
  }

  async function addTerm(e, kind) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;
    const okAdd = await send('/api/admin/catalogue', { kind, ...Object.fromEntries(f.entries()) });
    if (okAdd) form.reset();
  }

  const list = (kind) => (kind === 'category' ? data.categories : data.providers);

  return (
    <>
      {err ? <div className="alert" data-testid="cat-error">{err}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 10 }}>الدورات</h3>
        {data.courses.length === 0 ? (
          <p className="muted">لا دورات بعد.</p>
        ) : (
          <table className="gain" data-testid="catalogue-courses">
            <thead>
              <tr><th>الدورة</th><th>الدروس</th><th>التسجيلات</th>
                  <th>التصنيف</th><th>المزوّد</th></tr>
            </thead>
            <tbody>
              {data.courses.map((c) => (
                <tr key={c.course_id}>
                  {/* الرمز في سطره: صنف ltr يجعل العنصر inline-block، فلو
                      حمله الـ div نفسه التصق الرمز بالعنوان على سطر واحد. */}
                  <td><b>{c.title_ar}</b>
                    <div className="tiny muted"><span className="ltr">{c.code}</span></div>
                  </td>
                  <td className="num">{c.lessons}</td>
                  <td className="num">{c.enrolments}</td>
                  {['category', 'provider'].map((kind) => {
                    const cur = kind === 'category' ? c.category_id : c.provider_id;
                    return (
                      <td key={kind}>
                        <select className="pick" disabled={busy} value={cur || ''}
                                data-testid={`set-${kind}-${c.course_id}`}
                                onChange={(e) => send(`/api/admin/courses/${c.course_id}`,
                                  { [kind === 'category' ? 'categoryId' : 'providerId']: e.target.value },
                                  'PATCH')}>
                          <option value="">— بلا —</option>
                          {/* المعطَّل يظهر لمن هو مُسنَدٌ إليه فقط: لا يُسنَد من جديد ولا يختفي ممّا أُسند */}
                          {list(kind).filter((t) => t.is_active || t.id === cur).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name_ar}{t.is_active ? '' : ' (معطَّل)'}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid g2">
        {Object.entries(KINDS).map(([kind, meta]) => (
          <div className="card" key={kind}>
            <h3 style={{ marginBottom: 10 }}>{meta.title}</h3>

            <form onSubmit={(e) => addTerm(e, kind)} style={{ marginBottom: 14 }}>
              <label className="field">
                <span>الاسم بالعربية</span>
                <input name="nameAr" required autoComplete="off"
                       placeholder={meta.ph} data-testid={`${kind}-name`} />
              </label>
              <label className="field">
                <span>الاسم بالإنجليزية</span>
                <input name="nameEn" dir="ltr" autoComplete="off" data-testid={`${kind}-name-en`} />
              </label>
              <button className="btn gold" disabled={busy} data-testid={`${kind}-add`}>
                {busy ? 'جارٍ…' : `إضافة ${meta.one}`}
              </button>
            </form>

            {list(kind).length === 0 ? (
              <p className="muted tiny">لا {meta.one} بعد.</p>
            ) : (
              <table className="gain" data-testid={`${kind}-table`}>
                <thead><tr><th>الاسم</th><th>دورات</th><th>الحالة</th><th></th></tr></thead>
                <tbody>
                  {list(kind).map((t) => (
                    <tr key={t.id} style={t.is_active ? undefined : { opacity: 0.6 }}>
                      <td><b>{t.name_ar}</b></td>
                      <td className="num">{t.courses || '—'}</td>
                      <td>
                        <span className={`pill${t.is_active ? ' ok' : ''}`}>
                          {t.is_active ? 'مفعّل' : 'معطَّل'}
                        </span>
                      </td>
                      <td>
                        <button className="linkbtn" disabled={busy}
                                data-testid={`${kind}-toggle-${t.id}`}
                                onClick={() => send(`/api/admin/catalogue/${t.id}`,
                                  { kind, isActive: !t.is_active }, 'PATCH')}>
                          {t.is_active ? 'تعطيل' : 'تفعيل'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
