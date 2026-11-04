'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const SCOPE_AR    = { individual: 'فردي', department: 'إدارة' };
const PRIORITY_AR = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };
const STATUS_AR   = { draft: 'مسوّدة', submitted: 'بانتظار الاعتماد',
                      approved: 'معتمد', rejected: 'مرفوض' };
const SOURCE_AR   = { self: 'إعلان الموظف', manager: 'رفعه رئيسه',
                      department: 'احتياج الإدارة', assessment: 'من القياس' };

export default function NeedsEditor({ cycle, wide, initial, me }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({
    scope: 'department', departmentId: initial.departments[0]?.id || '',
    userId: '', subjectKind: 'skill', skillId: '', courseId: '', titleAr: '',
    headcount: 1, priority: 'medium', justification: '',
  });

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function send(url, method, body) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(url, {
        method, headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { setErr(j.error || 'تعذّر إتمام الطلب'); return false; }
      router.refresh();
      return true;
    } finally { setBusy(false); }
  }

  async function raise(submit) {
    const body = {
      cycleYear: cycle, scope: f.scope, submit,
      departmentId: f.scope === 'department' ? f.departmentId : null,
      userId: f.scope === 'individual' ? f.userId : null,
      skillId:  f.subjectKind === 'skill'  ? f.skillId  : null,
      courseId: f.subjectKind === 'course' ? f.courseId : null,
      titleAr:  f.subjectKind === 'free'   ? f.titleAr  : null,
      headcount: Number(f.headcount) || 1,
      priority: f.priority,
      justification: f.justification,
    };
    if (await raiseOk(body)) {
      setF((s) => ({ ...s, userId: '', skillId: '', courseId: '', titleAr: '',
                     headcount: 1, justification: '' }));
    }
    async function raiseOk(bd) { return send('/api/academy/needs', 'POST', bd); }
  }

  const decide = (id, action) => send('/api/academy/needs', 'PATCH', { id, action });

  return (
    <>
      <section className="card" style={{ marginBottom: 22 }}>
        <h2 style={{ marginTop: 0 }}>رفع احتياج</h2>

        <div className="g2">
          <label>
            <span>النطاق</span>
            <select value={f.scope} onChange={(e) => set('scope', e.target.value)}
                    data-testid="need-scope">
              <option value="department">احتياج إدارة</option>
              <option value="individual">احتياج موظّف</option>
            </select>
          </label>

          {f.scope === 'department' ? (
            <label>
              <span>الإدارة</span>
              <select value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)}
                      data-testid="need-dept">
                {initial.departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name_ar}</option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              <span>الموظّف</span>
              <select value={f.userId} onChange={(e) => set('userId', e.target.value)}
                      data-testid="need-person">
                <option value="">— اختر —</option>
                {initial.people.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name_ar} · {p.email}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="g2">
          <label>
            <span>الموضوع</span>
            <select value={f.subjectKind} onChange={(e) => set('subjectKind', e.target.value)}
                    data-testid="need-kind">
              <option value="skill">مهارة من الكتالوج</option>
              <option value="course">دورة قائمة</option>
              <option value="free">عنوان حرّ</option>
            </select>
          </label>

          {f.subjectKind === 'skill' && (
            <label>
              <span>المهارة</span>
              <select value={f.skillId} onChange={(e) => set('skillId', e.target.value)}>
                <option value="">— اختر —</option>
                {initial.skills.map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
              </select>
            </label>
          )}
          {f.subjectKind === 'course' && (
            <label>
              <span>الدورة</span>
              <select value={f.courseId} onChange={(e) => set('courseId', e.target.value)}>
                <option value="">— اختر —</option>
                {initial.courses.map((c) => <option key={c.id} value={c.id}>{c.title_ar}</option>)}
              </select>
            </label>
          )}
          {f.subjectKind === 'free' && (
            <label>
              <span>العنوان</span>
              <input value={f.titleAr} onChange={(e) => set('titleAr', e.target.value)}
                     placeholder="موضوعٌ لا دورة له بعد" data-testid="need-title" />
            </label>
          )}
        </div>

        <div className="g2">
          {f.scope === 'department' && (
            <label>
              <span>عدد الموظفين</span>
              <input type="number" min="1" value={f.headcount}
                     onChange={(e) => set('headcount', e.target.value)} data-testid="need-count" />
            </label>
          )}
          <label>
            <span>الأولوية</span>
            <select value={f.priority} onChange={(e) => set('priority', e.target.value)}>
              <option value="high">عالية</option>
              <option value="medium">متوسطة</option>
              <option value="low">منخفضة</option>
            </select>
          </label>
        </div>

        <label>
          <span>المبرّر</span>
          <input value={f.justification} onChange={(e) => set('justification', e.target.value)}
                 placeholder="لماذا يلزم هذا التدريب؟" />
        </label>

        {err ? <p className="no" style={{ marginTop: 10 }} data-testid="need-error">{err}</p> : null}

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button className="btn gold" disabled={busy} onClick={() => raise(true)}
                  data-testid="need-submit">رفعه للمراجعة</button>
          <button className="linkbtn" disabled={busy} onClick={() => raise(false)}
                  data-testid="need-draft">حفظه مسوّدة</button>
        </div>
      </section>

      {initial.rollup.length ? (
        <section style={{ marginBottom: 22 }}>
          <h2>التجميع — ما يحتاجه {wide ? 'الجهة' : 'إدارتك'} هذا العام</h2>
          <table className="gain">
            <thead>
              <tr>
                <th>الموضوع</th><th>موظفون</th><th>إدارات</th>
                <th>من الإدارة</th><th>فردي</th><th>عالية الأولوية</th><th>معتمد</th>
              </tr>
            </thead>
            <tbody>
              {initial.rollup.map((r, i) => (
                <tr key={i}>
                  <td><b>{r.subject_ar}</b>
                    {r.subject_kind === 'free'
                      ? <span className="tiny muted"> · لا دورة له بعد</span> : null}</td>
                  <td><b>{r.people}</b></td>
                  <td>{r.departments}</td>
                  <td>{r.dept_entries}</td>
                  <td>{r.individual_entries}</td>
                  <td className={Number(r.high_priority) ? 'no' : ''}>{r.high_priority}</td>
                  <td>{r.approved_entries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section>
        <h2>الاحتياجات المسجّلة</h2>
        {initial.needs.length === 0 ? (
          <p className="muted">لا احتياج مسجّل لهذه الدورة بعد.</p>
        ) : (
          <table className="gain" data-testid="needs-table">
            <thead>
              <tr>
                <th>الموضوع</th><th>النطاق</th><th>الجهة المعنيّة</th>
                <th>عدد</th><th>الأولوية</th><th>المصدر</th><th>الحالة</th><th></th>
              </tr>
            </thead>
            <tbody>
              {initial.needs.map((n) => (
                <tr key={n.id}>
                  <td><b>{n.subject_ar}</b>
                    {n.justification
                      ? <><br /><span className="tiny muted">{n.justification}</span></> : null}</td>
                  <td>{SCOPE_AR[n.scope]}</td>
                  <td>{n.scope === 'department' ? n.dept_name : n.person_name}</td>
                  <td>{n.headcount}</td>
                  <td className={n.priority === 'high' ? 'no' : ''}>{PRIORITY_AR[n.priority]}</td>
                  <td className="tiny">{SOURCE_AR[n.source]}
                    {n.raiser_name ? <><br /><span className="muted">{n.raiser_name}</span></> : null}</td>
                  <td>{STATUS_AR[n.status]}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {n.status === 'draft' ? (
                      <button className="linkbtn" disabled={busy}
                              onClick={() => decide(n.id, 'submit')}>رفعه</button>
                    ) : null}
                    {n.status === 'submitted' && wide ? (
                      <>
                        <button className="linkbtn" disabled={busy}
                                onClick={() => decide(n.id, 'approve')}
                                data-testid="need-approve">اعتماد</button>
                        {' '}
                        <button className="linkbtn" disabled={busy}
                                onClick={() => decide(n.id, 'reject')}>رفض</button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
