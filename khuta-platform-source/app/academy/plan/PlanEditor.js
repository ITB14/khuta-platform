'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const PRIORITY_AR = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };

export default function PlanEditor({ cycle, wide, initial }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [item, setItem] = useState({
    subjectKind: 'skill', skillId: '', courseId: '', titleAr: '',
    providerId: '', targetSeats: 0,
  });
  const [pick, setPick] = useState({});   // planItemId -> { deptId, seats }

  const plan = initial.plan;

  async function call(url, method, body, okMsg) {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await fetch(url, { method, headers: { 'content-type': 'application/json' },
                                   body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { setErr(j.error || 'تعذّر إتمام الطلب'); return null; }
      if (okMsg) setMsg(typeof okMsg === 'function' ? okMsg(j) : okMsg);
      router.refresh();
      return j;
    } finally { setBusy(false); }
  }

  const planApi = (body, okMsg) => call('/api/academy/plan', 'POST', body, okMsg);
  const selApi  = (body, m) => call('/api/academy/plan/selection', 'POST', body, m);
  const unselApi = (body) => call('/api/academy/plan/selection', 'DELETE', body, 'سُحب الاختيار');

  const selectionsFor = (id) => initial.selections.filter((s) => s.plan_item_id === id);
  const deptNames = Object.fromEntries(initial.myDepartments.map((d) => [d.id, d.name_ar]));

  // ------------------------------------------------------- لا خطة بعد --
  if (!plan) {
    return (
      <section className="card">
        <h2 style={{ marginTop: 0 }}>لا خطة لهذه الدورة</h2>
        {wide ? (
          <>
            <p className="muted">
              الاحتياجات المعتمدة في دورة {cycle}: <b>{initial.approvedNeeds}</b>.
              أنشئ الخطة ثم ابنِ بنودها منها.
            </p>
            {err ? <p className="no">{err}</p> : null}
            <button className="btn gold" disabled={busy} data-testid="plan-create"
                    onClick={() => planApi({ action: 'create', cycleYear: cycle },
                                           'أُنشئت الخطة')}>
              إنشاء خطة {cycle}
            </button>
          </>
        ) : (
          <p className="muted">لم تُنشر خطةٌ لهذه الدورة بعد.</p>
        )}
      </section>
    );
  }

  const editable = wide && plan.status !== 'closed';
  const choosable = plan.status === 'published';

  return (
    <>
      {wide ? (
        <section className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>{plan.title_ar}</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="linkbtn" disabled={busy || plan.status === 'closed'}
                    data-testid="plan-build"
                    onClick={() => planApi({ action: 'build', planId: plan.id },
                      (j) => `أُضيف ${j.added} بندًا من الاحتياج المعتمد`)}>
              بناء البنود من الاحتياج ({initial.approvedNeeds} معتمدًا)
            </button>
            {plan.status === 'draft' ? (
              <button className="btn gold" disabled={busy} data-testid="plan-publish"
                      onClick={() => planApi({ action: 'publish', planId: plan.id }, 'نُشرت الخطة')}>
                نشر الخطة
              </button>
            ) : null}
            {plan.status === 'published' ? (
              <button className="linkbtn" disabled={busy} data-testid="plan-close"
                      onClick={() => planApi({ action: 'close', planId: plan.id }, 'أُغلقت الخطة')}>
                إغلاق الخطة
              </button>
            ) : null}
          </div>
          {err ? <p className="no" style={{ marginTop: 10 }} data-testid="plan-error">{err}</p> : null}
          {msg ? <p className="tiny" style={{ marginTop: 10 }} data-testid="plan-msg">{msg}</p> : null}
        </section>
      ) : null}

      {editable ? (
        <section className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>إضافة بند</h3>
          <div className="g2">
            <label>
              <span>الموضوع</span>
              <select value={item.subjectKind}
                      onChange={(e) => setItem({ ...item, subjectKind: e.target.value })}>
                <option value="skill">مهارة</option>
                <option value="course">دورة</option>
                <option value="free">عنوان حرّ</option>
              </select>
            </label>
            {item.subjectKind === 'skill' && (
              <label><span>المهارة</span>
                <select value={item.skillId}
                        onChange={(e) => setItem({ ...item, skillId: e.target.value })}>
                  <option value="">— اختر —</option>
                  {initial.skills.map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
                </select></label>
            )}
            {item.subjectKind === 'course' && (
              <label><span>الدورة</span>
                <select value={item.courseId}
                        onChange={(e) => setItem({ ...item, courseId: e.target.value })}>
                  <option value="">— اختر —</option>
                  {initial.courses.map((c) => <option key={c.id} value={c.id}>{c.title_ar}</option>)}
                </select></label>
            )}
            {item.subjectKind === 'free' && (
              <label><span>العنوان</span>
                <input value={item.titleAr}
                       onChange={(e) => setItem({ ...item, titleAr: e.target.value })} /></label>
            )}
          </div>
          <div className="g2">
            <label><span>المزوّد (اختياري)</span>
              <select value={item.providerId}
                      onChange={(e) => setItem({ ...item, providerId: e.target.value })}>
                <option value="">— بلا —</option>
                {initial.providers.map((p) => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
              </select></label>
            <label><span>المقاعد المستهدفة</span>
              <input type="number" min="0" value={item.targetSeats}
                     onChange={(e) => setItem({ ...item, targetSeats: e.target.value })} /></label>
          </div>
          <button className="linkbtn" disabled={busy} data-testid="item-add"
                  onClick={() => planApi({
                    action: 'add-item', planId: plan.id,
                    skillId:  item.subjectKind === 'skill'  ? item.skillId  : null,
                    courseId: item.subjectKind === 'course' ? item.courseId : null,
                    titleAr:  item.subjectKind === 'free'   ? item.titleAr  : null,
                    providerId: item.providerId || null,
                    targetSeats: Number(item.targetSeats) || 0,
                  }, 'أُضيف البند').then((j) => {
                    if (j) setItem({ ...item, skillId: '', courseId: '', titleAr: '', targetSeats: 0 });
                  })}>
            إضافة
          </button>
        </section>
      ) : null}

      <section>
        <h2>بنود الخطة</h2>
        {initial.items.length === 0 ? (
          <p className="muted">لا بنود بعد.</p>
        ) : (
          <table className="gain" data-testid="plan-items">
            <thead>
              <tr>
                <th>الموضوع</th><th>المزوّد</th><th>مستهدف</th><th>مطلوب</th>
                <th>إدارات</th><th>الاحتياج</th><th>اختيار إدارتك</th>
              </tr>
            </thead>
            <tbody>
              {initial.items.map((r) => {
                const sels = selectionsFor(r.plan_item_id);
                const p = pick[r.plan_item_id] || {
                  deptId: initial.myDepartments[0]?.id || '', seats: 1 };
                return (
                  <tr key={r.plan_item_id}>
                    <td>
                      <b>{r.subject_ar}</b>
                      {r.subject_kind === 'free'
                        ? <span className="tiny muted"> · لا دورة له بعد</span> : null}
                      {sels.length ? (
                        <><br /><span className="tiny muted">
                          {sels.map((s) => `${s.dept_name}: ${s.seats}`).join(' · ')}
                        </span></>
                      ) : null}
                    </td>
                    <td className="tiny">{r.provider_ar || '—'}</td>
                    <td>
                      {editable ? (
                        <input type="number" min="0" defaultValue={r.target_seats}
                               style={{ width: 70 }} disabled={busy}
                               onBlur={(e) => {
                                 const v = Number(e.target.value);
                                 if (v !== Number(r.target_seats)) {
                                   planApi({ action: 'update-item', itemId: r.plan_item_id,
                                             targetSeats: v });
                                 }
                               }} />
                      ) : <b>{r.target_seats}</b>}
                    </td>
                    <td className={Number(r.selected_seats) > Number(r.target_seats) ? 'no' : ''}>
                      <b>{r.selected_seats}</b>
                    </td>
                    <td>{r.departments}</td>
                    <td className="tiny">{r.need_people ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {choosable && initial.myDepartments.length ? (
                        <>
                          <select value={p.deptId} disabled={busy}
                                  onChange={(e) => setPick({ ...pick,
                                    [r.plan_item_id]: { ...p, deptId: e.target.value } })}>
                            {initial.myDepartments.map((d) => (
                              <option key={d.id} value={d.id}>{d.name_ar}</option>
                            ))}
                          </select>
                          {' '}
                          <input type="number" min="1" value={p.seats} style={{ width: 60 }}
                                 disabled={busy}
                                 onChange={(e) => setPick({ ...pick,
                                   [r.plan_item_id]: { ...p, seats: e.target.value } })} />
                          {' '}
                          <button className="linkbtn" disabled={busy} data-testid="sel-add"
                                  onClick={() => selApi({
                                    planItemId: r.plan_item_id, departmentId: p.deptId,
                                    seats: Number(p.seats) || 1 }, 'سُجّل الاختيار')}>
                            اختيار
                          </button>
                          {sels.some((s) => deptNames[s.department_id]) ? (
                            <> <button className="linkbtn" disabled={busy}
                                       onClick={() => unselApi({
                                         planItemId: r.plan_item_id, departmentId: p.deptId })}>
                              سحب
                            </button></>
                          ) : null}
                        </>
                      ) : <span className="tiny muted">
                            {plan.status === 'draft' ? 'لم تُنشر بعد' : 'أُغلقت'}
                          </span>}
                      {editable ? (
                        <> <button className="linkbtn" disabled={busy}
                                   onClick={() => planApi({ action: 'delete-item',
                                                            itemId: r.plan_item_id }, 'حُذف البند')}>
                          حذف
                        </button></>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {err ? <p className="no" style={{ marginTop: 10 }}>{err}</p> : null}
      </section>

      {initial.selections.length ? (
        <section style={{ marginTop: 22 }}>
          <h2>ما اختارته الإدارات</h2>
          <table className="gain">
            <thead><tr><th>الإدارة</th><th>البند</th><th>مقاعد</th><th>الأولوية</th></tr></thead>
            <tbody>
              {initial.selections.map((s, i) => {
                const it = initial.items.find((x) => x.plan_item_id === s.plan_item_id);
                return (
                  <tr key={i}>
                    <td>{s.dept_name}</td>
                    <td>{it?.subject_ar || '—'}</td>
                    <td>{s.seats}</td>
                    <td className={s.priority === 'high' ? 'no' : ''}>{PRIORITY_AR[s.priority]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
