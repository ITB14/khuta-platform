'use strict';
// End to end, through a real browser against the running server and the real
// database. Nothing is stubbed: the password is checked by argon2, the code by
// our RFC 6238 implementation, the session by a row in PostgreSQL.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('node:fs');
const totp = require('../src/totp');

const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const EMAIL = 'salem@alain.example';
const PASS = 'Munic1pality!Khuta';
const SECRET = fs.readFileSync(__dirname + '/../.demo-secret', 'utf8').trim();

let pass = 0, fail = 0;
const ok = (c, label) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`); };
const section = (t) => console.log(`\n--- ${t} ---`);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'ar-AE', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  section('الوصول قبل الدخول');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  ok(page.url().endsWith('/signin'), 'لوحة المتعلّم محميّة — تُحوّل إلى شاشة الدخول');
  ok(await page.locator('html[dir="rtl"][lang="ar"]').count() === 1, 'الصفحة عربية من اليمين لليسار');

  section('كلمة مرور خاطئة');
  await page.fill('input[name=email]', EMAIL);
  await page.fill('input[name=password]', 'WrongPassword123');
  await page.click('button.btn');
  await page.waitForSelector('.alert', { timeout: 7000 });
  ok((await page.textContent('.alert')).includes('غير صحيحة'), 'تظهر رسالة خطأ واضحة');
  ok(page.url().includes('/signin') && !page.url().includes('mfa'), 'ولا يحدث أي انتقال');

  section('كلمة المرور الصحيحة');
  await page.fill('input[name=password]', PASS);
  await page.click('button.btn');
  await page.waitForURL('**/signin/mfa', { timeout: 7000 });
  ok(true, 'كلمة المرور وحدها لا تدخل — تُطلب الخطوة الثانية');
  const cookiesAfterPw = await ctx.cookies();
  ok(!cookiesAfterPw.some((c) => c.name === 'khuta_session'),
     'ولا تُصدَر جلسة قبل الخطوة الثانية');
  ok(cookiesAfterPw.some((c) => c.name === 'khuta_mfa_pending' && c.httpOnly),
     'والحالة الوسيطة في ملف ارتباط httpOnly موقَّع');

  section('رمز التحقّق');
  await page.fill('input[name=code]', '000000');
  await page.click('button.btn');
  await page.waitForSelector('.alert', { timeout: 7000 });
  ok((await page.textContent('.alert')).includes('غير صحيح'), 'رمز خاطئ يُرفض');

  await page.fill('input[name=code]', totp.totp(SECRET));
  await page.click('button.btn');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  ok(true, 'والرمز الصحيح يُكمل الدخول');
  const session = (await ctx.cookies()).find((c) => c.name === 'khuta_session');
  ok(!!session && session.httpOnly && session.sameSite === 'Lax',
     'وملف ارتباط الجلسة httpOnly و SameSite=Lax');

  section('لوحة المتعلّم');
  const body = await page.textContent('body');
  ok(body.includes('سالم محمد الكعبي'), 'الاسم معروض');
  ok(body.includes('Microsoft Copilot'), 'والدورة المسندة معروضة');
  ok(body.includes('خُطى'), 'واسم المنصة مشكّل في شريط المنصة');
  ok(body.includes('من 8 دروس'), 'والتقدّم محسوب من قاعدة البيانات');
  // The seeded learner starts honestly: no pre-assessment taken, so R1 has not
  // opened lesson 1 and R3 has opened nothing after it. All five are locked.
  const locked = await page.locator('.lesson.locked').count();
  ok(locked === 8, `والدروس الثمانية مقفلة قبل التقييم القبلي — ر١ و ر٣ ظاهرتان في الواجهة (وجدت ${locked})`);
  ok(body.includes('٩٥٪'), 'وقاعدة المشاهدة مشروحة للمتعلّم');

  section('تسجيل الخروج');
  await page.click('button.linkbtn');
  await page.waitForURL('**/signin', { timeout: 7000 });
  ok(true, 'الخروج يعيد إلى شاشة الدخول');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  ok(page.url().endsWith('/signin'), 'والعودة إلى اللوحة بعد الخروج ممنوعة');

  section('لقطات');
  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/home/claude/platform/.shots/01-signin.png' });
  await page.fill('input[name=email]', EMAIL);
  await page.fill('input[name=password]', PASS);
  await page.click('button.btn');
  await page.waitForURL('**/signin/mfa');
  await page.screenshot({ path: '/home/claude/platform/.shots/02-mfa.png' });
  await page.fill('input[name=code]', totp.totp(SECRET));
  await page.click('button.btn');
  await page.waitForURL('**/dashboard');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/home/claude/platform/.shots/03-dashboard.png', fullPage: true });
  ok(true, 'لقطات الشاشات الثلاث محفوظة');

  await browser.close();
  console.log(`\n${'='.repeat(58)}\n  ${pass} PASS · ${fail} FAIL\n${'='.repeat(58)}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nERROR:', e.message); process.exit(1); });
