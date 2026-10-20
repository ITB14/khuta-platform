'use strict';
// قارئ CSV. ملفّات الجهات تأتي من Excel، وExcel يفعل أشياء بعينها: يضع
// علامة ترتيب بايتات، وينهي السطور بـ CRLF، ويقتبس كل خليّة فيها فاصلة.
const { parse, toRecords } = require('../src/csv');

let pass = 0, fail = 0;
const ok = (c, label) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`); };
const section = (t) => console.log(`\n--- ${t} ---`);

section('التفكيك');
ok(JSON.stringify(parse('a,b\n1,2')) === JSON.stringify([['a', 'b'], ['1', '2']]),
   'صفّان وخليّتان');
ok(JSON.stringify(parse('a,b\r\n1,2\r\n')) === JSON.stringify([['a', 'b'], ['1', '2']]),
   'ونهايات CRLF كما يكتبها Excel');
ok(parse('﻿الاسم,البريد\nس,a@b.c')[0][0] === 'الاسم',
   'وعلامة ترتيب البايتات تُتخطّى — لولا ذلك لما طابق عمود «الاسم» شيئًا');
ok(parse('a,"b,c"\n1,2')[0][1] === 'b,c', 'وفاصلة داخل اقتباس ليست فاصلًا');
ok(parse('a,"قال ""نعم"""\n1,2')[0][1] === 'قال "نعم"', 'واقتباس مزدوج داخل اقتباس');
ok(parse('a,"سطر\nثانٍ"\n1,2').length === 2, 'وسطر جديد داخل اقتباس لا يقسم الصفّ');
ok(parse('a,b\n\n\n1,2').length === 2, 'والسطور الفارغة تُهمل');

section('التحويل إلى سجلّات');
const good = toRecords('الاسم,البريد,الإدارة\nمريم المنصوري,m@alain.example,تقنية المعلومات');
ok(good.missing.length === 0, 'عناوين عربية تُفهم');
ok(good.records.length === 1, 'وصفّ واحد');
ok(good.records[0].fullNameAr === 'مريم المنصوري', 'والاسم في مكانه');
ok(good.records[0].email === 'm@alain.example', 'والبريد');
ok(good.records[0].department === 'تقنية المعلومات', 'والإدارة');
ok(good.records[0].line === 2, 'ورقم السطر كما يراه المستخدم في الملف لا كفهرس');

const en = toRecords('Name,Email,Department\nMaryam,m@alain.example,IT');
ok(en.missing.length === 0 && en.records[0].fullNameAr === 'Maryam',
   'وعناوين إنجليزية تُفهم كذلك');

const mixedCase = toRecords('  EMAIL , الاسم \nm@alain.example,مريم');
ok(mixedCase.missing.length === 0 && mixedCase.records[0].fullNameAr === 'مريم',
   'ومسافات وحالة أحرف في العناوين لا تهمّ');

const noEmail = toRecords('الاسم,الإدارة\nمريم,تقنية');
ok(noEmail.missing.includes('البريد'), 'وعمود ناقص يُذكر مرّة واحدة لا لكل صفّ');

const headerOnly = toRecords('الاسم,البريد');
ok(headerOnly.missing.length === 0 && headerOnly.records.length === 0,
   'وملفّ بعناوين بلا صفوف ليس خطأ في التحويل');

const blank = toRecords('الاسم,البريد\n,\nمريم,m@alain.example');
ok(blank.records.length === 1, 'وصفّ فارغ تمامًا يُهمل');

console.log(`\n==========================================================`);
console.log(`  ${pass} PASS · ${fail} FAIL`);
console.log(`==========================================================`);
process.exit(fail ? 1 : 0);
