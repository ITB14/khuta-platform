// Visual proof of R2: the learner watches part of a lesson, the server counts
// the coverage, and the server refuses the completion. Demo mode is switched on
// for the run and off again afterwards, so the tenant is left as it should be
// in production.
//
// Prerequisite: run after test/playback.test.js on a freshly seeded learner.
// That suite is what takes the pre-assessment and completes lesson 1, which is
// what unlocks lesson 2 — the lesson these shots are of.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('node:fs');
fs.readFileSync(__dirname + '/../.env.local', 'utf8').split('\n').filter(Boolean)
  .forEach((l) => { const i = l.indexOf('='); if (i > 0) process.env[l.slice(0, i)] = l.slice(i + 1); });
const totp = require('../src/totp');
const db = require('../src/db');
const SECRET = fs.readFileSync(__dirname + '/../.demo-secret', 'utf8').trim();

(async () => {
  const t = await db.resolveTenant('alain.khuta.b14facilities.com');
  const setDemo = (on) => db.withTenant(t.id, null, (c) =>
    c.query('update tenant set demo_mode=$1, demo_speed=8 where id=current_tenant()', [on]));

  const b = await chromium.launch();
  try {
    await setDemo(true);
    const p = await (await b.newContext({ locale: 'ar-AE', viewport: { width: 1280, height: 1000 } })).newPage();

    await p.goto('http://127.0.0.1:3100/signin');
    await p.fill('input[name=email]', 'salem@alain.example');
    await p.fill('input[name=password]', 'Munic1pality!Khuta');
    await p.click('button.btn'); await p.waitForURL('**/signin/mfa');
    await p.fill('input[name=code]', totp.totp(SECRET));
    await p.click('button.btn'); await p.waitForURL('**/dashboard');
    await p.screenshot({ path: '.shots/04-dashboard-fresh.png', fullPage: true });

    await p.goto('http://127.0.0.1:3100/lesson/2');
    await p.waitForSelector('[data-testid=player]');

    // Which rendition this browser chose, and that it really decoded it.
    await p.waitForFunction(() => document.querySelector('video')?.readyState >= 2, null, { timeout: 20000 });
    const chosen = await p.evaluate(() => {
      const v = document.querySelector('video');
      return { src: v.currentSrc.split('/').pop().split('?')[0], w: v.videoWidth, dur: Math.round(v.duration) };
    });
    console.log(`rendition chosen by the browser: ${chosen.src} · ${chosen.w}px · ${chosen.dur}s`);

    await p.click('[data-testid=rate-8]');
    await p.evaluate(() => document.querySelector('video').play());
    await p.waitForTimeout(9000);                       // ~72s of video at ×8
    await p.evaluate(() => document.querySelector('video').pause());
    await p.waitForTimeout(800);
    await p.screenshot({ path: '.shots/05-lesson-player.png', fullPage: true });

    await p.click('[data-testid=complete]');
    await p.waitForSelector('[data-testid=verdict]');
    await p.waitForTimeout(400);
    await p.screenshot({ path: '.shots/06-r2-refusal.png', fullPage: true });

    console.log('coverage shown:', (await p.textContent('[data-testid=coverage]')).trim());
    console.log('verdict:', (await p.textContent('[data-testid=verdict]')).trim());
  } finally {
    await b.close();
    await setDemo(false);                               // demo mode is off in production
    await db.close();
  }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
