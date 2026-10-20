'use client';
import { useState } from 'react';
import Link from 'next/link';

const SAMPLE = 'الاسم,البريد,الرقم الوظيفي,الإدارة,المسمى الوظيفي,الدفعة';

export default function ImportForm({ courses }) {
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [report, setReport] = useState(null);

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ''));
    reader.readAsText(f, 'utf-8');
  }

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch('/api/admin/learners/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          csv,
          courseCode: f.get('courseCode'),
          cohort: f.get('cohort'),
          dueDays: f.get('dueDays'),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok) setReport(j); else setErr(j.error || 'تعذّر الاستيراد.');
    } catch {
      setErr('تعذّر الاتصال بالخادم.');
    } finally {
      setBusy(false);
    }
  }

  // الملف يُبنى في المتصفّح ولا يمرّ بالخادم: بيانات الدخول لا تُكتب على قرص
  // ليست بيد صاحبها.
  function download() {
    const cell = (v) => {
      const s = String(v ?? '');
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [['الاسم', 'البريد', 'كلمة المرور المؤقّتة', 'سرّ المصادقة'].join(',')];
    for (const r of report.results.filter((x) => x.ok)) {
      lines.push([r.fullNameAr, r.email, r.password, r.mfaSecret].map(cell).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'],
      { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `khuta-credentials-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (report) {
    const good = report.results.filter((r) => r.ok);
    const bad = report.results.filter((r) => !r.ok);
    return (
      <>
        <div className="kpi" style={{ marginBottom: 16 }}>
          <div><b className="num">{report.total}</b><span>صفوف الملف</span></div>
          <div><b className="num">{report.created}</b><span>أُنشئت</span></div>
          <div><b className="num">{report.failed}</b><span>فشلت</span></div>
        </div>

        {good.length ? (
          <div className="cert" style={{ marginBottom: 16 }} data-testid="bulk-credentials">
            <h3 style={{ marginBottom: 8 }}>بيانات الدخول</h3>
            <p style={{ marginBottom: 12 }}>
              تظهر مرّة واحدة ولا تُستردّ. نزّلها الآن وسلّم كلّ متعلّم سطره،
              ثمّ <b>احذف الملف</b> — كلماتها مؤقّتة ويُطلب تغييرها عند أوّل دخول،
              وسرّ المصادقة ليس مؤقّتًا.
            </p>
            <button className="btn gold" onClick={download} data-testid="bulk-download">
              تنزيل بيانات الدخول (CSV)
            </button>
            <div style={{ marginTop: 14, maxHeight: 260, overflow: 'auto' }}>
              <table className="gain">
                <thead><tr><th>الاسم</th><th>البريد</th><th>كلمة المرور</th><th>سرّ المصادقة</th></tr></thead>
                <tbody>
                  {good.map((r) => (
                    <tr key={r.line}>
                      <td>{r.fullNameAr}</td>
                      <td className="ltr tiny">{r.email}</td>
                      <td className="ltr num">{r.password}</td>
                      <td className="ltr tiny" style={{ wordBreak: 'break-all' }}>{r.mfaSecret}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {bad.length ? (
          <div className="card" style={{ marginBottom: 16 }} data-testid="bulk-errors">
            <h3 style={{ marginBottom: 8 }}>صفوف لم تُنشأ</h3>
            <table className="gain">
              <thead><tr><th>السطر</th><th>البريد</th><th>السبب</th></tr></thead>
              <tbody>
                {bad.map((r) => (
                  <tr key={r.line}>
                    <td className="num">{r.line}</td>
                    <td className="ltr tiny">{r.email || '—'}</td>
                    <td>{r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="tiny muted" style={{ marginTop: 10 }}>
              أصلح هذه الصفوف في ملف جديد واستوردها وحدها — ما نجح لا يُعاد.
            </p>
          </div>
        ) : null}

        <div className="between">
          <Link className="btn gold" href="/admin">عودة إلى المتعلّمين</Link>
          <button className="btn" onClick={() => { setReport(null); setCsv(''); }}>
            استيراد ملف آخر
          </button>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={submit} className="card">
      {err ? <div className="alert" data-testid="error">{err}</div> : null}

      <label className="field">
        <span>ملف CSV</span>
        <input type="file" accept=".csv,text/csv" onChange={onFile} data-testid="b-file" />
      </label>

      <label className="field">
        <span>أو الصق المحتوى</span>
        <textarea name="csv" rows={8} value={csv} onChange={(e) => setCsv(e.target.value)}
                  placeholder={SAMPLE} dir="ltr" data-testid="b-csv"
                  style={{ width: '100%', padding: '11px 13px', border: '1px solid var(--line)',
                           borderRadius: 6, fontFamily: 'var(--font)', fontSize: 13 }} />
      </label>

      <div className="grid g3">
        <label className="field">
          <span>الدورة</span>
          <select name="courseCode" data-testid="b-course"
                  style={{ width: '100%', padding: '11px 13px', borderRadius: 6,
                           border: '1px solid var(--line)' }}>
            {courses.map((c) => <option key={c.code} value={c.code}>{c.title_ar}</option>)}
          </select>
        </label>
        <label className="field">
          <span>الدفعة (لمن لا دفعة له في الملف)</span>
          <input name="cohort" defaultValue="Q1-2027" autoComplete="off" data-testid="b-cohort" />
        </label>
        <label className="field">
          <span>المهلة بالأيام</span>
          <input name="dueDays" type="number" min="1" max="365" defaultValue="21" dir="ltr"
                 data-testid="b-due" />
        </label>
      </div>

      <div className="note" style={{ marginBottom: 14 }}>
        السطر الأوّل أسماء الأعمدة. المطلوب منها <b>الاسم</b> و<b>البريد</b>؛
        والبقية اختيارية: الرقم الوظيفي، الإدارة، المسمى الوظيفي، الدفعة.
        والحدّ خمسمئة صفّ في المرّة.
      </div>

      <button className="btn gold" disabled={busy || !csv.trim()} data-testid="b-submit">
        {busy ? 'جارٍ الإنشاء…' : 'استورد وأنشئ الحسابات'}
      </button>
    </form>
  );
}
