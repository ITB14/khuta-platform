'use client';
import { useState } from 'react';

const LABEL = { has: 'أتقنها', learning: 'أتعلّمها الآن', wants: 'أريد تعلّمها' };
const ORDER = ['has', 'learning', 'wants'];

export default function SkillsPicker({ skills, mine }) {
  const [state, setState] = useState(() =>
    Object.fromEntries(mine.map((m) => [m.skill_id, m.stance])));
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  // المعطّلة التي أعلنها صاحبها تبقى معروضة له، ولا تُعرض لمن لم يعلنها.
  const extra = mine.filter((m) => !m.is_active)
    .map((m) => ({ id: m.skill_id, name_ar: m.name_ar, category: m.category, retired: true }));
  const all = [...skills, ...extra];

  const groups = all.reduce((acc, s) => {
    const k = s.category || 'أخرى';
    (acc[k] = acc[k] || []).push(s);
    return acc;
  }, {});

  async function set(skillId, stance) {
    const before = state[skillId];
    const next = before === stance ? null : stance;       // الضغط على المختار يسحبه
    setState((s) => ({ ...s, [skillId]: next ?? undefined }));
    setBusy(skillId); setErr(null);
    const r = await fetch('/api/profile/skills', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skillId, stance: next }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    if (!j.ok) {
      setState((s) => ({ ...s, [skillId]: before }));
      setErr(j.error || 'تعذّر الحفظ. تحقّق من الاتصال.');
    }
  }

  const wanted = Object.values(state).filter((v) => v === 'wants').length;

  return (
    <>
      {err ? <div className="alert" data-testid="skill-error">{err}</div> : null}

      {Object.entries(groups).map(([cat, list]) => (
        <div className="card" style={{ marginBottom: 14 }} key={cat}>
          <h3 style={{ marginBottom: 10 }}>{cat}</h3>
          {list.map((s) => (
            <div className="lesson" key={s.id} data-testid={`skill-${s.id}`}>
              <div className="t">
                <b>{s.name_ar}</b>
                {s.retired ? <span className="tiny">لم تعد في الكتالوج</span> : null}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ORDER.map((st) => (
                  <button key={st} type="button"
                          className={`pill${state[s.id] === st ? ' gold' : ''}`}
                          disabled={busy === s.id || s.retired}
                          onClick={() => set(s.id, st)}
                          data-testid={`stance-${s.id}-${st}`}
                          style={{ cursor: s.retired ? 'default' : 'pointer', border: 0 }}>
                    {LABEL[st]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      <p className="tiny muted">
        اختر ما ينطبق، واضغط الخيار نفسه مرّة أخرى لتسحبه. ولا شيء هنا إلزامي.
        {wanted > 0 ? ` اخترت ${wanted} مهارة تريد تعلّمها.` : ''}
      </p>
    </>
  );
}
