'use strict';
// لقطات لاختبار الشهادة: ما يراه المتعلّم عند الخطأ وعند الإصابة. التصحيح
// يظهر على الخيار نفسه، والشرح تحته — وهذا ما لا يلتقطه اختبار نصّي.
const fs = require('node:fs');
fs.readFileSync(__dirname + '/../.env.local', 'utf8').split('\n').filter(Boolean)
  .forEach((l) => { const i = l.indexOf('='); if (i > 0) process.env[l.slice(0, i)] = l.slice(i + 1); });
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { Pool } = require('pg');
const db = require('../src/db');
const totp = require('../src/totp');

const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const EMAIL = 'salem@alain.example';
const PASS = 'Munic1pality!Khuta';
const OUT = __dirname + '/../.shots';

(async () => {
  const SECRET = fs.readFileSync(__dirname + '/../.demo-secret', 'utf8').trim();
  const admin = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT),
    user: 'khuta', database: process.env.PGDATABASE, max: 2 });
  const t = await db.resolveTenant('alain.khuta.b14facilities.com');

  // المشاهدة مُثبتة في مجموعة الاختبارات؛ هنا تُختصر لأن الهدف الشاشة.
  await db.withTenant(t.id, null, (c) => c.query(`
    update lesson_progress lp set completed_at = now(), unlocked_at = now()
      from enrolment e join app_user u on u.id = e.user_id
     where e.id = lp.enrolment_id and lower(u.email) = lower($1)`, [EMAIL]));

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'ar-AE', viewport: { width: 1180, height: 1000 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=email]', EMAIL);
  await page.fill('input[name=password]', PASS);
  await page.click("form button");
  await page.waitForURL('**/signin/mfa');
  await page.fill('input[name=code]', totp.totp(SECRET));
  await page.click("form button");
  await page.waitForURL('**/dashboard');
  await page.screenshot({ path: `${OUT}/open-dashboard.png`, fullPage: true });

  await page.goto(`${BASE}/assessment/post`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid=final-quiz]');
  await page.screenshot({ path: `${OUT}/final-q1.png`, fullPage: true });

  // الخيار الخاطئ: يُقرأ المفتاح هنا بصفة مالك المخطّط لا من الصفحة.
  const ext = await page.locator('[data-testid^=q-]').first().getAttribute('data-testid');
  const eid = ext.replace('q-', '');
  const { rows } = await admin.query(`
    select o.label, o.is_correct from question_option o
      join question q on q.id = o.question_id
     where q.external_id = $1 order by o.position`, [eid]);
  const wrong = rows.find((o) => !o.is_correct).label;
  const right = rows.find((o) => o.is_correct).label;

  await page.click(`[data-testid="opt-${eid}-${wrong}"]`);
  await page.waitForSelector('[data-testid=reveal]');
  await page.screenshot({ path: `${OUT}/final-wrong.png`, fullPage: true });

  await page.click(`[data-testid="opt-${eid}-${right}"]`);
  await page.waitForSelector('[data-testid=correct]');
  await page.screenshot({ path: `${OUT}/final-right.png`, fullPage: true });

  await browser.close();
  await db.close(); await admin.end();
  console.log('shots in', OUT);
})().catch(async (e) => { console.error(e); process.exit(1); });
