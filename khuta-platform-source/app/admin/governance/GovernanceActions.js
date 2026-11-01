'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ENTITY_AR = { watch_heartbeat: 'نبضات المشاهدة' };

export default function GovernanceActions({ rules }) {
  const router = useRouter();
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);

  async function send(body) {
    setErr(null); setNote(null); setBusy(true);
    try {
      const r = await fetch('/api/admin/governance', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { setErr(j.error || 'تعذّرت العملية.'); return null; }
      router.refresh();
      return j;
    } catch { setErr('تعذّر الاتصال بالخادم.'); return null; }
    finally { setBusy(false); }
  }

  async function run(entity) {
    const j = await send({ action: 'retention-run', entity });
    if (j) setNote(`حُذفت ${j.deleted} نبضة.`);
    setConfirming(null);
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 10 }}>قواعد الاحتفاظ</h3>
      {err ? <div className="alert" data-testid="gov-error">{err}</div> : null}
      {note ? <div className="note ok" data-testid="gov-note"><p>{note}</p></div> : null}

      <p className="tiny" style={{ marginBottom: 12 }}>
        القاعدة تُنشأ <b>معطَّلة</b>، ولا يحذف شيءٌ حتى تُفعَّل ثم يُضغط
        التنفيذ. لا الترحيل يحذف، ولا فتحُ الصفحة يحذف، ولا جدولةٌ تحذف —
        الحذف لا يُستردّ فتبقى يده يد إنسان.
      </p>

      <table className="gain" data-testid="retention">
        <thead>
          <tr><th>الكيان</th><th>يُحتفظ به</th><th>تجاوز القاعدة</th>
              <th>آخر تنفيذ</th><th>الحالة</th><th></th></tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.entity_name}>
              <td>
                <b>{ENTITY_AR[r.entity_name] || r.entity_name}</b>
                {r.legal_basis ? <div className="tiny muted">{r.legal_basis}</div> : null}
              </td>
              <td className="num">{r.retain_months} أشهر</td>
              <td className={`num${r.due > 0 ? ' no' : ''}`}>{r.due || '—'}</td>
              <td className="tiny">
                {r.last_run_at
                  ? <>{new Date(r.last_run_at).toLocaleDateString('ar-AE')}
                      <div className="muted">{r.last_run_rows} صفًّا</div></>
                  : '—'}
              </td>
              <td>
                <span className={`pill${r.is_active ? ' ok' : ''}`}>
                  {r.is_active ? 'مفعّلة' : 'معطَّلة'}
                </span>
              </td>
              <td>
                <button className="linkbtn" disabled={busy}
                        data-testid={`ret-toggle-${r.entity_name}`}
                        onClick={() => send({ action: 'retention-toggle',
                          entity: r.entity_name, isActive: !r.is_active })}>
                  {r.is_active ? 'تعطيل' : 'تفعيل'}
                </button>
                {r.is_active && r.due > 0 ? (
                  confirming === r.entity_name ? (
                    <>
                      <button className="btn" disabled={busy}
                              style={{ marginInlineStart: 10 }}
                              data-testid={`ret-run-${r.entity_name}`}
                              onClick={() => run(r.entity_name)}>
                        {/* العدد في الزرّ نفسه: من يضغط يعرف كم يحذف */}
                        احذف {r.due} نهائيًّا
                      </button>
                      <button className="linkbtn" disabled={busy}
                              style={{ marginInlineStart: 8 }}
                              onClick={() => setConfirming(null)}>تراجع</button>
                    </>
                  ) : (
                    <button className="linkbtn" disabled={busy}
                            style={{ marginInlineStart: 10 }}
                            data-testid={`ret-ask-${r.entity_name}`}
                            onClick={() => setConfirming(r.entity_name)}>تنفيذ…</button>
                  )
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
