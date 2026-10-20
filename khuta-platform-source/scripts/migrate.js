'use strict';
// يطبّق ملفات db/ بالترتيب مرة واحدة، ويسجّل ما طُبّق كي يكون إعادة التشغيل
// آمنة. يعمل من داخل صورة التطبيق، فلا يحتاج الخادم إلى نسخة من ملفات SQL
// ولا إلى عميل psql — وهذا ما يجعل النشر عبر لوحة Docker ممكنًا أصلًا.
//
//   node scripts/migrate.js
//
// يتّصل بصلاحية مالك المخطّط (PGADMIN_USER أو khuta)، ثم يضبط كلمة مرور دور
// التطبيق من APP_DB_PASSWORD — فلا تُكتب كلمة مرور في أي ملف.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const DIR = path.join(__dirname, '..', 'db');
const SKIP = new Set(['003_verify.sql']);          // مجموعة فحص لا ترحيل

async function main() {
  const c = new Client({
    host: process.env.PGHOST || 'db',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGADMIN_USER || 'khuta',
    password: process.env.PGADMIN_PASSWORD || process.env.POSTGRES_PASSWORD,
    database: process.env.PGDATABASE || 'khuta',
  });

  // قاعدة البيانات قد تكون ما زالت تُقلع عند أول تشغيل
  for (let i = 1; ; i++) {
    try { await c.connect(); break; }
    catch (e) {
      if (i >= 30) throw e;
      process.stdout.write(`في انتظار قاعدة البيانات (${i})\r`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  await c.query(`create table if not exists schema_migration (
                   filename   text primary key,
                   applied_at timestamptz not null default now())`);
  const done = new Set((await c.query('select filename from schema_migration')).rows.map((r) => r.filename));

  const files = fs.readdirSync(DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f) && !SKIP.has(f)).sort();
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) { console.log(`تخطّي ${f}`); continue; }
    const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
    // الملفات المولَّدة تحمل begin/commit خاصّين بها
    const wrapped = /^\s*begin\s*;/im.test(sql);
    try {
      if (!wrapped) await c.query('begin');
      await c.query(sql);
      if (!wrapped) await c.query('commit');
      await c.query('insert into schema_migration (filename) values ($1)', [f]);
      console.log(`طُبّق ${f}`);
      applied++;
    } catch (e) {
      if (!wrapped) await c.query('rollback').catch(() => {});
      throw new Error(`فشل ${f}: ${e.message}`);
    }
  }

  if (process.env.APP_DB_PASSWORD) {
    await c.query(`alter role khuta_app with password '${
      process.env.APP_DB_PASSWORD.replace(/'/g, "''")}'`);
    console.log('ضُبطت كلمة مرور دور التطبيق');
  } else {
    console.warn('تحذير: APP_DB_PASSWORD غير مضبوط — دور التطبيق على كلمة المرور الأوّلية');
  }

  console.log(`تمّ: ${applied} ملفًّا جديدًا من ${files.length}`);
  await c.end();
}

main().catch((e) => { console.error('خطأ:', e.message); process.exit(1); });
