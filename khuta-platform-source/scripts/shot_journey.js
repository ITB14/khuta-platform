// The whole learner journey captured as screens, on a freshly seeded learner.
// The slow parts that have no screen of their own — watching lessons two to
// five — are driven through the same API the player calls, inside the browser's
// own session, so nothing here bypasses a rule.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
fs.readFileSync(__dirname + '/../.env.local', 'utf8').split('\n').filter(Boolean)
  .forEach((l) => { const i = l.indexOf('='); if (i > 0) process.env[l.slice(0, i)] = l.slice(i + 1); });
const { Pool } = require('pg');
const totp = require('../src/totp');
const db = require('../src/db');

const BASE = 'http://127.0.0.1:3100';
const DIR = __dirname + '/../.shots';
const admin = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT),
  user: 'khuta', database: process.env.PGDATABASE, max: 2 });

let n = 3;
// Quiz screens are captured at viewport size: their action bar is sticky, and
// a full-page capture would freeze it halfway down the paper.
const shot = async (p, name, full = true) => {
  n += 1;
  const file = `${DIR}/${String(n).padStart(2, '0')}-${name}.png`;
  await p.screenshot({ path: file, fullPage: full });
  console.log('  ' + file.split('/').pop());
};

(async () => {
  execFileSync('node', [__dirname + '/seed_demo_user.js'], { stdio: 'ignore' });
  const SECRET = fs.readFileSync(__dirname + '/../.demo-secret', 'utf8').trim();

  const t = await db.resolveTenant('alain.khuta.b14facilities.com');
  const setDemo = (on) => db.withTenant(t.id, null, (c) =>
    c.query('update tenant set demo_mode=$1, demo_speed=8 where id=current_tenant()', [on]));

  const b = await chromium.launch();
  try {
    await setDemo(true);
    const ctx = await b.newContext({ locale: 'ar-AE', viewport: { width: 1280, height: 1000 } });
    const p = await ctx.newPage();

    await p.goto(`${BASE}/signin`);
    await p.fill('input[name=email]', 'salem@alain.example');
    await p.fill('input[name=password]', 'Munic1pality!Khuta');
    await p.click('button.btn'); await p.waitForURL('**/signin/mfa');
    await p.fill('input[name=code]', totp.totp(SECRET));
    await p.click('button.btn'); await p.waitForURL('**/dashboard');
    await shot(p, 'dashboard-fresh');

    // ---------------------------------------------------- the pre-assessment
    await p.click('[data-testid=start-pre]');
    await p.waitForSelector('[data-testid=quiz]');
    await p.waitForTimeout(300);
    await shot(p, 'pre-assessment', false);

    // answered by clicking, exactly as a learner would, four of ten correctly
    const key = await admin.query(`select o.question_id, o.id, o.is_correct, o.label, q.external_id
                                     from question_option o join question q on q.id = o.question_id`);
    const cards = await p.locator('.q').all();
    for (const [i, card] of cards.entries()) {
      const id = (await card.getAttribute('data-testid')).replace('q-', '');
      const want = i < 4;
      const opt = key.rows.find((o) => o.external_id === id && o.is_correct === want);
      await card.locator(`[data-testid$="-${opt.label}"]`).click();
      await p.waitForTimeout(80);
    }
    await shot(p, 'pre-answered', false);
    await p.click('[data-testid=submit]');
    await p.waitForURL('**/result/**');
    await shot(p, 'pre-result');

    await p.goto(`${BASE}/dashboard`);
    await shot(p, 'dashboard-unlocked');

    // ------------------------------------------------- lesson one, and R2 --
    const ids = await db.withTenant(t.id, null, (c) => c.query(
      `select l.no, l.id, l.end_sec - l.start_sec dur, e.id enrolment
         from lesson l cross join enrolment e join app_user u on u.id = e.user_id
        where lower(u.email) = 'salem@alain.example' order by l.no`));
    const L = ids.rows;

    await p.goto(`${BASE}/lesson/1`);
    await p.waitForSelector('[data-testid=player]');
    await p.waitForFunction(() => document.querySelector('video')?.readyState >= 2, null, { timeout: 20000 });
    await p.click('[data-testid=rate-8]');
    await p.evaluate(() => document.querySelector('video').play());
    await p.waitForTimeout(9000);
    await p.evaluate(() => document.querySelector('video').pause());
    await p.waitForTimeout(700);
    await shot(p, 'lesson-player');
    await p.click('[data-testid=complete]');
    await p.waitForSelector('[data-testid=verdict]');
    await shot(p, 'r2-refusal');

    // the rest of the lesson, through the API the player itself uses
    // The browser's own session cookie, so these calls are the learner's.
    const jar = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
    const api = async (path, body) => {
      const r = await fetch(BASE + path, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: jar },
        body: JSON.stringify(body || {}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
      return j;
    };
    const beat = (lesson, pos) => api(`/api/lesson/${lesson.id}/heartbeat`,
      { enrolmentId: lesson.enrolment, positionSec: pos, seq: pos + lesson.no * 1000 });
    for (let s = 0; s <= L[0].dur; s += 10) await beat(L[0], s);
    await p.reload();
    await p.waitForSelector('[data-testid=player]');
    await p.click('[data-testid=complete]');
    await p.waitForSelector('[data-testid=to-quiz]');
    await shot(p, 'lesson-complete');

    // --------------------------------------------------------- the quiz ----
    await p.click('[data-testid=to-quiz]');
    await p.waitForSelector('[data-testid=quiz]');
    await shot(p, 'lesson-quiz', false);
    for (const card of await p.locator('.q').all()) {
      const id = (await card.getAttribute('data-testid')).replace('q-', '');
      const opt = key.rows.find((o) => o.external_id === id && o.is_correct);
      await card.locator(`[data-testid$="-${opt.label}"]`).click();
      await p.waitForTimeout(80);
    }
    await p.click('[data-testid=submit]');
    await p.waitForURL('**/result/**');
    await shot(p, 'quiz-result');

    // ------------------------------- lessons two to five, then the post ----
    for (const l of L.slice(1)) {
      for (let s = 0; s <= l.dur; s += 10) await beat(l, s);
      await api(`/api/lesson/${l.id}/complete`, { enrolmentId: l.enrolment });
      const start = await api('/api/assessment/start', { slug: `lesson-${l.no}` });
      for (const q of start.questions) {
        const opt = key.rows.find((o) => o.question_id === q.id && o.is_correct);
        await api(`/api/attempt/${start.attemptId}/respond`, { questionId: q.id, optionId: opt.id });
      }
      await api(`/api/attempt/${start.attemptId}/submit`);
    }
    await p.goto(`${BASE}/dashboard`);
    await shot(p, 'dashboard-post-open');

    await p.click('[data-testid=start-post]');
    await p.waitForSelector('[data-testid=quiz]');
    for (const [i, card] of (await p.locator('.q').all()).entries()) {
      const id = (await card.getAttribute('data-testid')).replace('q-', '');
      const opt = key.rows.find((o) => o.external_id === id && o.is_correct === (i < 10));
      await card.locator(`[data-testid$="-${opt.label}"]`).click();
      await p.waitForTimeout(60);
    }
    await p.click('[data-testid=submit]');
    await p.waitForURL('**/result/**');
    await p.waitForSelector('[data-testid=gain]');
    await shot(p, 'post-result-gain');

    // ------------------------------------------------- certificate and R9 --
    const code = await p.locator('[data-testid=certificate] .code').textContent();
    await p.goto(`${BASE}/verify?code=${encodeURIComponent(code.trim())}`);
    await shot(p, 'verify-valid');

    await admin.query(`update certificate set revoked_at=now(), revoked_reason=$2 where verify_code=$1`,
      [code.trim(), 'لقطة توضيحية للإلغاء']);
    await p.reload();
    await shot(p, 'verify-revoked');
    await admin.query(`update certificate set revoked_at=null, revoked_reason=null where verify_code=$1`,
      [code.trim()]);

    console.log(`\nرمز التحقّق: ${code.trim()}`);
  } finally {
    await b.close();
    await setDemo(false);
    await db.close(); await admin.end();
  }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
