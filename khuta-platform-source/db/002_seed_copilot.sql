-- generated from copilot_course.json — do not edit by hand
begin;

insert into tenant (slug, name_ar, name_en, demo_mode, demo_speed)
values ('alain', 'بلدية مدينة العين', 'Al Ain City Municipality', false, 1),
       ('bki',   'معهد ابن خلدون',    'Bin Khaldoon Institute',   false, 1)
on conflict (slug) do nothing;

insert into course (tenant_id, code, title_ar, title_en, language, status)
select id, 'COP-101', 'Microsoft Copilot في العمل المؤسسي', 'Microsoft Copilot at Work', 'ar', 'published'
  from tenant where slug = 'alain'
on conflict (tenant_id, code) do nothing;

insert into competency (tenant_id, course_id, code, title_ar)
select co.tenant_id, co.id, v.code, v.t
  from course co, (values ('C1','تعريف Copilot وموضعه داخل منظومة Microsoft 365'),('C2','حدود وصول Copilot إلى البيانات وعلاقتها بصلاحيات المستخدم'),('C3','مكوّنات الأمر الفعّال: المطلوب والسياق والشكل'),('C4','تحسين الأمر وإعادة صياغته عند ضعف المخرجات'),('C5','Copilot في Word — الصياغة والتلخيص'),('C6','Copilot في Outlook — تلخيص السلاسل واقتراح الردود'),('C7','Copilot في Excel — التحليل والصيغ والرسوم'),('C8','Copilot في Teams و PowerPoint — الاجتماعات والعروض'),('C9','التحقّق من المخرجات والوعي بالمعلومة المختلَقة'),('C10','الاستخدام المسؤول وحدود السرّية والمسؤولية المهنية'),('C11','تنظيم المعلومات المشتّتة والتمييز بين وضع Work ووضع Web'),('C12','التخطيط للمشاريع وتحليل المشكلات بمساعدة Copilot')) as v(code, t)
 where co.code = 'COP-101'
on conflict (course_id, code) do nothing;

insert into media_asset (tenant_id, original_filename, bytes, duration_sec, state)
select tenant_id, 'copilot final 1.mp4', 3036130764, 1662, 'ready'
  from course where code = 'COP-101';

insert into media_rendition (tenant_id, asset_id, label, width, height, bitrate_kbps, bytes, storage_key, state)
select a.tenant_id, a.id, v.label, v.w, v.h, v.br, v.bytes,
       'media/' || a.id || '/' || v.label || '.mp4', 'ready'
  from media_asset a,
       (values ('720p',1280,720,1400,272000000::bigint),
               ('480p',854,480,700,136000000::bigint)) as v(label,w,h,br,bytes)
 where a.original_filename = 'copilot final 1.mp4'
on conflict (asset_id, label) do nothing;

insert into lesson (tenant_id, course_id, no, title_ar, asset_id, start_sec, end_sec, required_watch_ratio)
select co.tenant_id, co.id, v.no, v.t, a.id, v.s, v.e, 0.95
  from course co
  join media_asset a on a.tenant_id = co.tenant_id and a.original_filename = 'copilot final 1.mp4',
       (values (1,'ما هو Copilot وأين يعمل وحدود وصوله',0,165),(2,'الأمر الفعّال: العناصر الخمسة',165,312),(3,'Copilot في Outlook — التلخيص والردود',312,550),(4,'Copilot في Word — الصياغة والتلخيص',550,815),(5,'Copilot في Excel — التحليل والصيغ والرسوم',815,1037),(6,'Copilot في PowerPoint و Teams',1037,1240),(7,'تنظيم المعلومات والتخطيط وتحليل المشكلات',1240,1520),(8,'الضوابط والمراجعة البشرية والمسؤولية',1520,1662)) as v(no, t, s, e)
 where co.code = 'COP-101'
on conflict (course_id, no) do nothing;

insert into assessment (tenant_id, course_id, kind, lesson_id, pass_mark, max_attempts)
select co.tenant_id, co.id, 'pre', null, null, 1 from course co where co.code = 'COP-101';

insert into assessment (tenant_id, course_id, kind, lesson_id, pass_mark, max_attempts)
select co.tenant_id, co.id, 'post', null, 0.7, 2
  from course co where co.code = 'COP-101';

insert into assessment (tenant_id, course_id, kind, lesson_id, pass_mark, max_attempts)
select l.tenant_id, l.course_id, 'lesson', l.id, 0.67, 3
  from lesson l join course co on co.id = l.course_id
 where co.code = 'COP-101';

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'PRE-01', 'ما هو Microsoft Copilot؟', 1
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C1'
 where co.code = 'COP-101' and a.kind = 'pre'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','برنامج مستقلّ يُثبَّت على الجهاز بترخيص منفصل',false),(2,'ب','مساعد ذكاء اصطناعي مدمج داخل تطبيقات Microsoft 365',true),(3,'ج','خدمة تخزين سحابي بديلة عن OneDrive',false),(4,'د','أداة لإدارة كلمات المرور',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'PRE-01'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'PRE-02', 'أيّ العبارات أصحّ في وصف ما يستطيع Copilot الوصول إليه من بيانات الجهة؟', 2
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C2'
 where co.code = 'COP-101' and a.kind = 'pre'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','كلّ ملفات الجهة بلا استثناء',false),(2,'ب','الملفات والرسائل التي يملك المستخدم نفسه صلاحية الوصول إليها',true),(3,'ج','الإنترنت فقط، دون أي بيانات داخلية',false),(4,'د','لا شيء — يعمل على معلوماته المدرَّب عليها فقط',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'PRE-02'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'PRE-03', 'ما الذي يجعل أمر Copilot أقرب إلى النتيجة المطلوبة؟', 3
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C3'
 where co.code = 'COP-101' and a.kind = 'pre'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','إطالة الأمر قدر الإمكان',false),(2,'ب','تحديد الدور والمهمة والسياق والنتيجة والأسلوب',true),(3,'ج','كتابة الأمر بالإنجليزية دائمًا',false),(4,'د','تكرار الأمر أكثر من مرة',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'PRE-03'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'PRE-04', 'جاءت نتيجة Copilot عامّة ولا تفي بالغرض. ما التصرّف الأنسب؟', 4
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C4'
 where co.code = 'COP-101' and a.kind = 'pre'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','تكرار الأمر نفسه حتى تتحسّن النتيجة',false),(2,'ب','إعادة صياغة الأمر بإضافة السياق وتحديد الشكل والجمهور',true),(3,'ج','الانتقال إلى تطبيق آخر',false),(4,'د','قبول النتيجة كما هي وتعديلها يدويًا بالكامل',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'PRE-04'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'PRE-05', 'أيّ المهامّ التالية يؤدّيها Copilot داخل Word؟', 5
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C5'
 where co.code = 'COP-101' and a.kind = 'pre'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','تحويل الملف إلى PDF مشفّر',false),(2,'ب','صياغة مسوّدة أو تلخيص مستند قائم',true),(3,'ج','إرسال المستند تلقائيًا إلى الأرشيف',false),(4,'د','تغيير صلاحيات الوصول إلى الملف',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'PRE-05'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'PRE-06', 'ما الفائدة الأبرز لـ Copilot في Outlook؟', 6
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C6'
 where co.code = 'COP-101' and a.kind = 'pre'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','حذف الرسائل غير المرغوبة',false),(2,'ب','تلخيص سلسلة رسائل طويلة واقتراح ردّ عليها',true),(3,'ج','زيادة مساحة صندوق البريد',false),(4,'د','تشفير المرفقات',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'PRE-06'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'PRE-07', 'ما الذي يستطيع Copilot فعله في Excel؟', 7
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C7'
 where co.code = 'COP-101' and a.kind = 'pre'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','تحليل جدول بيانات واقتراح صيغ ورسوم مناسبة',true),(2,'ب','طباعة الملف على طابعة الشبكة',false),(3,'ج','حماية الملف بكلمة مرور',false),(4,'د','تحويل الجدول إلى صورة',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'PRE-07'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'PRE-08', 'ما الذي يقدّمه Copilot في اجتماع Teams؟', 8
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C8'
 where co.code = 'COP-101' and a.kind = 'pre'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','رفع جودة الصوت',false),(2,'ب','تلخيص النقاش واستخراج القرارات والمهامّ',true),(3,'ج','تسجيل الحضور في نظام الموارد البشرية',false),(4,'د','ترجمة الشرائح إلى PDF',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'PRE-08'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'PRE-09', 'أدرج Copilot رقمًا في تقرير تعدّه. ما الواجب قبل اعتماده؟', 9
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C9'
 where co.code = 'COP-101' and a.kind = 'pre'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','استخدامه مباشرة لأنه مستخرج من بيانات الجهة',false),(2,'ب','الرجوع إلى المصدر والتحقّق من الرقم قبل اعتماده',true),(3,'ج','حذف الرقم وكتابة تقدير شخصي بدلًا منه',false),(4,'د','إرساله إلى المدير ليتحقّق منه',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'PRE-09'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'PRE-10', 'موظف يريد تلخيص عقد يحمل تصنيف «سرّي» باستخدام Copilot. ما الضابط الصحيح؟', 10
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C10'
 where co.code = 'COP-101' and a.kind = 'pre'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','ممنوع استخدام Copilot مع أي مستند رسمي',false),(2,'ب','يجوز ضمن سياسة الجهة وفي حدود صلاحيته على المستند',true),(3,'ج','يجوز بشرط حذف المستند بعد التلخيص',false),(4,'د','يجوز إن نسخ النصّ إلى أداة خارجية أولًا',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'PRE-10'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'PRE-11', 'عند البحث في بيانات جهتك عبر Microsoft 365 Copilot، أيّ وضع تستخدم؟', 11
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C11'
 where co.code = 'COP-101' and a.kind = 'pre'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','وضع Web للوصول إلى أوسع المصادر',false),(2,'ب','وضع Work ليقتصر البحث على بيانات المؤسسة',true),(3,'ج','لا فرق بين الوضعين',false),(4,'د','الوضعان معًا في الوقت نفسه',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'PRE-11'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'PRE-12', 'طلبت من Copilot خطة مشروع لتسعين يومًا. ما صفة ما يُنتجه؟', 12
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C12'
 where co.code = 'COP-101' and a.kind = 'pre'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','خطة نهائية معتمدة للتنفيذ',false),(2,'ب','تصوّر أوّلي يُعدَّل وفق الموارد والميزانية والمواعيد واللوائح',true),(3,'ج','قرار إداري ملزم',false),(4,'د','بديل عن فريق المشروع',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'PRE-12'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L1-Q1', 'أين يظهر Copilot للمستخدم عادةً؟', 1
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C1'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 1
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','في موقع مستقلّ يُفتح بحساب منفصل',false),(2,'ب','داخل التطبيق نفسه الذي يعمل عليه المستخدم',true),(3,'ج','في لوحة تحكّم تقنية المعلومات فقط',false),(4,'د','في تطبيق الهاتف دون الحاسوب',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L1-Q1'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L1-Q2', 'أين تجد أيقونة Copilot داخل Word أو Excel أو PowerPoint؟', 2
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C1'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 1
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','في تبويب Home',true),(2,'ب','في قائمة File فقط',false),(3,'ج','في شريط الحالة أسفل النافذة',false),(4,'د','في إعدادات الحساب',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L1-Q2'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L1-Q3', 'ملفّ لا تملك صلاحية فتحه. هل يستطيع Copilot تلخيصه لك؟', 3
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C2'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 1
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','نعم، لأنه يصل إلى كل بيانات الجهة',false),(2,'ب','لا، لأنه لا يتجاوز صلاحيات المستخدم',true),(3,'ج','نعم، إن ذكرتَ اسم الملف بدقّة',false),(4,'د','نعم، بعد موافقة شفوية من المدير',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L1-Q3'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L2-Q1', 'أيّ هذه الأوامر أفضل صياغة؟', 1
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C3'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 2
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','اكتب لي شيئًا عن السلامة',false),(2,'ب','لخّص تقرير السلامة المرفق في خمس نقاط موجَّهة لرؤساء الأقسام',true),(3,'ج','سلامة',false),(4,'د','اكتب أطول تقرير ممكن عن السلامة',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L2-Q1'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L2-Q2', 'كم عنصرًا تبني عليه الدورة الأمر الفعّال، وما هي؟', 2
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C3'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 2
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','ثلاثة: المطلوب والسياق والشكل',false),(2,'ب','خمسة: الدور والمهمة والسياق والنتيجة والأسلوب',true),(3,'ج','اثنان: المهمة والأسلوب',false),(4,'د','أربعة: الدور والمهمة والنتيجة والطول',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L2-Q2'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L2-Q3', 'جاء الناتج طويلًا ورسميًا أكثر من اللازم. ما أسرع تصحيح؟', 3
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C4'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 2
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','إعادة كتابة الناتج يدويًا',false),(2,'ب','مطالبته بإعادة الصياغة بطول وأسلوب محدَّدين',true),(3,'ج','تجاهل الناتج والبدء من جديد',false),(4,'د','تغيير لغة واجهة التطبيق',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L2-Q3'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L2-Q4', 'ما الذي يحدّده عنصر «النتيجة» في الأمر؟', 4
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C4'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 2
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','الموعد النهائي للتسليم',false),(2,'ب','الشكل الذي يظهر به المخرج: جدول منظّم أو قائمة واضحة أو تقرير مختصر',true),(3,'ج','عدد مرات إعادة المحاولة',false),(4,'د','اللغة المستخدمة في المخرج',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L2-Q4'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L3-Q1', 'سلسلة بريد من ثلاثين رسالة أُضفت إليها متأخّرًا. الأنسب:', 1
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C6'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 3
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','قراءة الرسائل من الأحدث إلى الأقدم',false),(2,'ب','طلب ملخّص للسلسلة وتحديد ما يتطلّب ردًّا منك',true),(3,'ج','حذف الرسائل القديمة',false),(4,'د','إعادة توجيه السلسلة إلى المدير',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L3-Q1'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L3-Q2', 'اقترح Copilot ردًّا على بريد رسمي. ما الخطوة التالية؟', 2
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C6'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 3
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','إرساله كما هو لتوفير الوقت',false),(2,'ب','مراجعته وتعديل ما يلزم قبل الإرسال',true),(3,'ج','حذفه وكتابة ردّ يدوي',false),(4,'د','إعادة توجيهه إلى المرسِل',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L3-Q2'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L3-Q3', 'ما المهامّ الثلاث الرئيسية التي يؤدّيها Copilot في البريد الإلكتروني؟', 3
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C6'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 3
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','التلخيص وصياغة الرسائل وتحسين الأسلوب',true),(2,'ب','الأرشفة والحذف والتصنيف',false),(3,'ج','التشفير والتوقيع والإرسال',false),(4,'د','الترجمة والطباعة والجدولة',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L3-Q3'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L4-Q1', 'مستند من ثلاثين صفحة وتحتاج ملخّصًا لاجتماع بعد ساعة. الأنسب في Word:', 1
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C5'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 4
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','طلب تلخيصه مع تحديد عدد النقاط والجمهور المستهدف',true),(2,'ب','طباعته وقراءته',false),(3,'ج','تحويله إلى PowerPoint ثم تلخيصه',false),(4,'د','إرساله إلى زميل ليلخّصه',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L4-Q1'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L4-Q2', 'ما الذي لا يفعله Copilot في Word؟', 2
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C5'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 4
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','صياغة مسوّدة أولى',false),(2,'ب','إعادة صياغة فقرة بأسلوب مختلف',false),(3,'ج','تغيير صلاحيات مشاركة الملف',true),(4,'د','اقتراح عنوان للمستند',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L4-Q2'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L4-Q3', 'تُعدّ ملخّصًا لمستند طويل. بم يختلف ملخّص القيادة عن ملخّص المديرين التنفيذيين؟', 3
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C5'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 4
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','لا يختلفان',false),(2,'ب','ملخّص القيادة صفحة واحدة بالهدف والنتائج والتوصيات، والتنفيذيين من صفحتين إلى ثلاث تغطّي كل المحاور',true),(3,'ج','ملخّص القيادة هو الأطول',false),(4,'د','الفرق في الخطّ واللون فقط',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L4-Q3'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L5-Q1', 'جدول مبيعات لاثني عشر شهرًا وتريد معرفة الاتجاه العام. الأنسب في Excel:', 1
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C7'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 5
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','طلب تحليل الاتجاه واقتراح الرسم المناسب',true),(2,'ب','فرز الأعمدة يدويًا',false),(3,'ج','تحويل الجدول إلى نصّ',false),(4,'د','نسخ الأرقام إلى Word',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L5-Q1'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L5-Q2', 'ما الفائدة الإضافية حين يقترح Copilot صيغة في Excel؟', 2
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C7'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 5
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','أنه يشرح منطق الصيغة فتتعلّمها',true),(2,'ب','أنه يحمي الملف تلقائيًا',false),(3,'ج','أنه يرفع الملف إلى السحابة',false),(4,'د','أنه يطبع النتيجة',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L5-Q2'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L5-Q3', 'اقترح Copilot معادلة في Excel. ما الواجب قبل اعتمادها؟', 3
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C7'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 5
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','اعتمادها مباشرة لأنها مولَّدة آليًا',false),(2,'ب','مراجعة المعادلة ومقارنة نتائجها بالبيانات الأصلية',true),(3,'ج','حذف البيانات الأصلية بعد الحساب',false),(4,'د','تحويل الجدول إلى صورة',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L5-Q3'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L6-Q1', 'لديك مستند معتمد وتريد عرضًا تقديميًا منه. الأنسب في PowerPoint:', 1
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C8'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 6
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','نسخ الفقرات في الشرائح يدويًا',false),(2,'ب','طلب توليد عرض من المستند ثم تنقيحه',true),(3,'ج','البدء من قالب فارغ',false),(4,'د','تحويل المستند إلى صور',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L6-Q1'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L6-Q2', 'فاتك اجتماع Teams مسجَّل مدّته ساعة. الأنسب:', 2
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C8'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 6
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','مشاهدة التسجيل كاملًا',false),(2,'ب','طلب ملخّص النقاش والقرارات والمهامّ المسندة إليك',true),(3,'ج','سؤال الزملاء واحدًا واحدًا',false),(4,'د','تجاهل الاجتماع',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L6-Q2'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L6-Q3', 'ما الشرط لعمل Copilot على توثيق اجتماع Teams؟', 3
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C8'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 6
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','تسجيل الحضور في نظام الموارد البشرية',false),(2,'ب','تفعيل النسخ النصي مع إبلاغ جميع المشاركين',true),(3,'ج','ألّا يتجاوز الاجتماع ساعة',false),(4,'د','أن يُعقد الاجتماع عبر متصفّح Edge',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L6-Q3'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L7-Q1', 'عند استخدام Microsoft 365 Copilot للبحث في بيانات جهتك، ما الوضع الصحيح؟', 1
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C11'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 7
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','وضع Web',false),(2,'ب','وضع Work',true),(3,'ج','وضع Private',false),(4,'د','وضع Guest',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L7-Q1'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L7-Q2', 'ماذا يفعل Copilot حين تتعارض المعلومات بين مصدرين داخل الجهة؟', 2
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C11'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 7
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','يختار الأحدث ويتجاهل الآخر',false),(2,'ب','يُظهر نقاط التوافق والتعارض مع المراجع التي استند إليها',true),(3,'ج','يرفض المعالجة حتى يُحسم التعارض',false),(4,'د','يدمج الرقمين بالمتوسّط',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L7-Q2'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L7-Q3', 'إلى كم مرحلة تقسّم الدورة خطة التسعين يومًا؟', 3
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C12'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 7
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','مرحلتان: التخطيط والتنفيذ',false),(2,'ب','ثلاث: التحليل والتنفيذ والتقييم',false),(3,'ج','أربع: التحليل والتصميم والتنفيذ والتقييم',true),(4,'د','خمس مراحل',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L7-Q3'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L7-Q4', 'ما الفائدة التي تذكرها الدورة لاستخدام Copilot في تحليل المشكلات؟', 4
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C12'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 7
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','يستبدل الفريق المتخصّص',false),(2,'ب','يقلّل وقت العصف الذهني ويمنح الفريق نقطة انطلاق محدّدة',true),(3,'ج','يضمن صحّة الأسباب المقترَحة',false),(4,'د','يُصدر القرار النهائي بالحلّ',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L7-Q4'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L8-Q1', 'أدرج Copilot مرجعًا نظاميًا برقم مادة في مذكّرة رسمية. ما الواجب قبل التوقيع؟', 1
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C9'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 8
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','التوقيع مباشرة',false),(2,'ب','الرجوع إلى نصّ النظام والتأكّد من رقم المادة وسريانها',true),(3,'ج','حذف المرجع لتفادي الخطأ',false),(4,'د','سؤال Copilot إن كان متأكّدًا',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L8-Q1'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L8-Q2', 'أيّ هذه الممارسات خاطئة؟', 2
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C10'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 8
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','تلخيص مستند تملك صلاحيته',false),(2,'ب','نسخ بيانات موظفين إلى أداة ذكاء اصطناعي خارجية',true),(3,'ج','التحقّق من المخرجات قبل اعتمادها',false),(4,'د','طلب صياغة ردّ على بريد داخلي',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L8-Q2'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'L8-Q3', 'من يتحمّل مسؤولية خطأ ورد في تقرير صاغه Copilot ووقّعه الموظف؟', 3
  from assessment a join lesson l on l.id = a.lesson_id 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C10'
 where co.code = 'COP-101' and a.kind = 'lesson' and l.no = 8
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','مايكروسوفت',false),(2,'ب','الموظف الموقِّع',true),(3,'ج','إدارة تقنية المعلومات',false),(4,'د','لا أحد، فالخطأ آليّ',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'L8-Q3'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'POST-01', 'أيّ جملة تصف Copilot كما ورد في الدورة؟', 1
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C1'
 where co.code = 'COP-101' and a.kind = 'post'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','برنامج مستقلّ يُشترى ويُثبَّت بترخيص منفصل',false),(2,'ب','مساعد يعتمد على الذكاء الاصطناعي التوليدي ويعمل داخل بيئة Microsoft 365',true),(3,'ج','محرّك بحث على الإنترنت',false),(4,'د','نظام لإدارة المستندات والأرشفة',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'POST-01'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'POST-02', 'زميلك لا يرى ملفًا تراه أنت. هل يستطيع Copilot عنده تلخيصه؟', 2
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C2'
 where co.code = 'COP-101' and a.kind = 'post'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','نعم، لأن Copilot يصل إلى كل ملفات الجهة',false),(2,'ب','لا، لأن Copilot لا يتجاوز صلاحيات مستخدمه',true),(3,'ج','نعم، إن ذكر اسم الملف بدقّة',false),(4,'د','نعم، بعد موافقة المدير',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'POST-02'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'POST-03', 'أيّ الأوامر التالية أرجح أن يعطي مخرجًا صالحًا للاستخدام مباشرة؟', 3
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C3'
 where co.code = 'COP-101' and a.kind = 'post'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','لخّص هذا',false),(2,'ب','لخّص محضر الاجتماع المرفق في ثلاث نقاط مع المهامّ ومسؤوليها',true),(3,'ج','اكتب عن الاجتماع',false),(4,'د','محضر',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'POST-03'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'POST-04', 'ما الخطوة الأنسب لتحسين نتيجة غير دقيقة؟', 4
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C4'
 where co.code = 'COP-101' and a.kind = 'post'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','تقليل عدد الكلمات في الأمر',false),(2,'ب','إضافة الجمهور المستهدف والطول والشكل المطلوب',true),(3,'ج','تكرار الأمر ثلاث مرات',false),(4,'د','تغيير لغة الواجهة',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'POST-04'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'POST-05', 'أيّ هذه المهامّ خارج نطاق Copilot في Word؟', 5
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C5'
 where co.code = 'COP-101' and a.kind = 'post'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','تلخيص مستند طويل',false),(2,'ب','إعادة صياغة فقرة',false),(3,'ج','منح زميل صلاحية التحرير على الملف',true),(4,'د','اقتراح عنوان',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'POST-05'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'POST-06', 'عدت من إجازة ووجدت سلسلة بريد طويلة تخصّ قرارًا مطلوبًا منك. الأنسب:', 6
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C6'
 where co.code = 'COP-101' and a.kind = 'post'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','قراءة كل رسالة بالترتيب',false),(2,'ب','طلب ملخّص السلسلة وتحديد القرار المطلوب منك',true),(3,'ج','طلب إعادة إرسال الموضوع',false),(4,'د','الاكتفاء بآخر رسالة',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'POST-06'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'POST-07', 'ما الذي يُعدّ استخدامًا صحيحًا لـ Copilot في Excel؟', 7
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C7'
 where co.code = 'COP-101' and a.kind = 'post'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','طلب تفسير الاتجاه في بيانات ربع سنوي واقتراح رسم له',true),(2,'ب','طلب حماية الملف بكلمة مرور',false),(3,'ج','طلب إرسال الملف بالبريد',false),(4,'د','طلب طباعة الملف',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'POST-07'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'POST-08', 'ما الذي يستخرجه Copilot من اجتماع Teams؟', 8
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C8'
 where co.code = 'COP-101' and a.kind = 'post'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','قائمة الحضور فقط',false),(2,'ب','ملخّص النقاش والقرارات والمهامّ ومسؤوليها',true),(3,'ج','جودة الاتصال',false),(4,'د','الشرائح المعروضة كصور',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'POST-08'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'POST-09', 'ذكر Copilot إحصائية دقيقة الرقم في مسوّدة تقرير. ما أسلم تصرّف؟', 9
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C9'
 where co.code = 'COP-101' and a.kind = 'post'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','اعتمادها لأن دقّتها دليل صحّتها',false),(2,'ب','التحقّق من مصدرها قبل إدراجها',true),(3,'ج','تقريب الرقم لتفادي الخطأ',false),(4,'د','حذف الفقرة كلّها',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'POST-09'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'POST-10', 'أيّ هذه الحالات يمثّل مخالفة واضحة؟', 10
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C10'
 where co.code = 'COP-101' and a.kind = 'post'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','تلخيص تقرير داخلي تملك صلاحيته',false),(2,'ب','لصق كشف رواتب في أداة ذكاء اصطناعي عامّة على الإنترنت',true),(3,'ج','طلب صياغة بريد لزميل',false),(4,'د','مراجعة مخرج Copilot قبل اعتماده',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'POST-10'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'POST-11', 'معلومات موضوع واحد موزّعة بين عشرات الملفات ورسائل متراكمة ومحاضر غير مفهرسة. ما الذي يقدّمه Copilot؟', 11
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C11'
 where co.code = 'COP-101' and a.kind = 'post'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','يحذف المصادر المكرّرة تلقائيًا',false),(2,'ب','ينظّم المصادر ويستخرج النتائج والاتجاهات ويُظهر التوافق والتعارض بينها',true),(3,'ج','يمنح صلاحية الوصول إلى الملفات المغلقة',false),(4,'د','يُصدر حكمًا بالمصدر الأصحّ',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'POST-11'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'POST-12', 'طلبت من Copilot تحليل أسباب تأخّر إنجاز المعاملات. إلى أي حدّ تعتمد نتيجته؟', 12
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C12'
 where co.code = 'COP-101' and a.kind = 'post'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','تُعتمد الأسباب كما وردت لأنها مبنية على تحليل',false),(2,'ب','تُعامَل كأفكار يراجعها المختصّ ويقارنها بالبيانات الواقعية',true),(3,'ج','تُرفع إلى الإدارة العليا مباشرة',false),(4,'د','تُستخدم بديلًا عن جلسة العصف الذهني',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'POST-12'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'POST-13', 'ما الذي يجمع بين أمر جيّد ومخرج موثوق؟', 13
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C3'
 where co.code = 'COP-101' and a.kind = 'post'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','تحديد السياق والشكل، ثم التحقّق من المخرج قبل اعتماده',true),(2,'ب','إطالة الأمر قدر الإمكان',false),(3,'ج','الاعتماد على الصياغة الافتراضية',false),(4,'د','استخدام الإنجليزية',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'POST-13'
on conflict (question_id, position) do nothing;

insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, 'POST-14', 'أيّ جملة تصف دور Copilot في العمل وصفًا صحيحًا؟', 14
  from assessment a 
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = 'C1'
 where co.code = 'COP-101' and a.kind = 'post'
on conflict (assessment_id, external_id) do nothing;

insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values (1,'أ','بديل عن الموظف في اتخاذ القرار',false),(2,'ب','مساعد يسرّع الإنجاز، والمسؤولية تبقى على الموظف',true),(3,'ج','أداة ترفيهية',false),(4,'د','نظام أرشفة للمستندات',false)) as v(p, lb, tx, ok)
 where qu.external_id = 'POST-14'
on conflict (question_id, position) do nothing;

update question set parallel_of = (select id from question where external_id = 'PRE-01')
 where external_id = 'POST-01';

update question set parallel_of = (select id from question where external_id = 'PRE-02')
 where external_id = 'POST-02';

update question set parallel_of = (select id from question where external_id = 'PRE-03')
 where external_id = 'POST-03';

update question set parallel_of = (select id from question where external_id = 'PRE-04')
 where external_id = 'POST-04';

update question set parallel_of = (select id from question where external_id = 'PRE-05')
 where external_id = 'POST-05';

update question set parallel_of = (select id from question where external_id = 'PRE-06')
 where external_id = 'POST-06';

update question set parallel_of = (select id from question where external_id = 'PRE-07')
 where external_id = 'POST-07';

update question set parallel_of = (select id from question where external_id = 'PRE-08')
 where external_id = 'POST-08';

update question set parallel_of = (select id from question where external_id = 'PRE-09')
 where external_id = 'POST-09';

update question set parallel_of = (select id from question where external_id = 'PRE-10')
 where external_id = 'POST-10';

update question set parallel_of = (select id from question where external_id = 'PRE-11')
 where external_id = 'POST-11';

update question set parallel_of = (select id from question where external_id = 'PRE-12')
 where external_id = 'POST-12';
commit;
