-- ============================================================================
--  النمط المفتوح — تعديل أقرّه صاحب القرار في ٢٦ أكتوبر ٢٠٢٦.
--
--  كان النموذج: تقييم قبلي إلزامي يفتح الدرس الأول، ثم كل درس يفتح تاليه
--  باجتياز اختباره، ثم تقييم بعدي بـ٧٠٪ تصدر عنه الشهادة.
--
--  صار النموذج: الدروس الثمانية مفتوحة كلّها من أول دخول. التقييم القبلي
--  اختياري، ومن تخطّاه لا يُقاس له مكسب تعلّم ولا يُمنع من شيء. ومتى أتمّ
--  المشاهدة أُتيح له اختبار واحد من اثني عشر سؤالًا — سؤال لكل مهارة —
--  يُصحَّح سؤالًا سؤالًا، ويُكشف له الصواب وشرحه عند الخطأ، ويعيد بلا حدّ
--  حتى يتمّها، فتصدر شهادته.
--
--  ما لم يتغيّر: المشاهدة يحتسبها الخادم بنبضات لا بإقرار المتصفّح (ر٢)،
--  ومفتاح الإجابات يبقى محجوبًا عن دور التطبيق (ر٥)، والشهادة قابلة
--  للتحقّق والإلغاء (ر٩).
--
--  والنمط القديم لم يُحذف: صار إعدادًا لكل دورة، ليبقى متاحًا لدورة إلزامية.
-- ============================================================================
begin;

-- ------------------------------------------------------------ نمط الدورة --
do $$ begin
  if not exists (select 1 from pg_type where typname = 'course_mode') then
    create type course_mode as enum ('strict','open');
  end if;
end $$;

alter table course add column if not exists mode course_mode not null default 'strict';
comment on column course.mode is
  'strict: النموذج الأصلي — قبليّ إلزامي وأقفال متتابعة. open: الدروس مفتوحة والاختبار النهائي وحده بوّابة الشهادة.';

update course set mode = 'open' where code = 'COP-101';

-- --------------------------------------------- أسئلة متقاعدة وشرح الصواب --
-- الاختبار النهائي سؤال واحد لكل مهارة. وفي البنك سؤالان زائدان يكرّران
-- مهارتين، فيبقيان في البنك ويخرجان من الورقة.
alter table question add column if not exists retired boolean not null default false;
alter table question add column if not exists explain_ar text;
comment on column question.explain_ar is
  'يُعرض بعد الإجابة الخاطئة مع الخيار الصحيح. مكتوب ليعلّم لا ليؤنّب.';

update question q set retired = true
  from assessment s
 where s.id = q.assessment_id and s.kind = 'post'
   and q.external_id in ('POST-13','POST-14');

update question q set explain_ar = v.t
  from assessment s, (values
    ('POST-01','‏Copilot مساعد توليدي يعمل داخل تطبيقات Microsoft 365 نفسها، لا موقعًا مستقلًّا ولا بديلًا عن الموظف. (الدرس الأول)'),
    ('POST-02','‏Copilot يرى ما يراه مستخدمه فقط. صلاحيات الملفّات هي الحدّ، فلا يكشف لزميلك ما ليس له حقّ فيه. (الدرس الأول)'),
    ('POST-03','الأمر الجيّد يحدّد المطلوب والسياق والشكل: «لخّص… في ثلاث نقاط… مع المهامّ ومسؤوليها». (الدرس الثاني)'),
    ('POST-04','حين يأتي المخرج ضعيفًا فالنقص في الأمر غالبًا لا في الأداة: أضِف الجمهور والطول والشكل. (الدرس الثاني)'),
    ('POST-05','‏Copilot يصوغ ويلخّص داخل المستند، أمّا الصلاحيات والمشاركة فمن إعدادات الملفّ لا منه. (الدرس الرابع)'),
    ('POST-06','أقوى استخدام في البريد: ملخّص السلسلة وتحديد القرار المطلوب منك، بدل قراءة عشرات الرسائل. (الدرس الثالث)'),
    ('POST-07','في Excel يفسّر الاتجاه ويقترح الصيغة والرسم، ويبقى التحقّق من الأرقام عليك. (الدرس الخامس)'),
    ('POST-08','من اجتماع Teams يستخرج ملخّص النقاش والقرارات والمهامّ ومسؤوليها. (الدرس السادس)'),
    ('POST-09','الرقم الدقيق أكثر ما يُطمئن وأحقّ ما يُراجَع: تحقّق من مصدره قبل إدراجه. (الدرس الثامن)'),
    ('POST-10','البيانات الحسّاسة لا تخرج إلى أداة عامّة على الإنترنت. هذا هو الخطّ الذي لا يُتجاوز. (الدرس الثامن)'),
    ('POST-11','قوّته هنا أنه ينظّم المشتّت ويُظهر ما يتوافق وما يتعارض بين المصادر. (الدرس السابع)'),
    ('POST-12','تحليله مُدخَل للتفكير لا حكم نهائي: يراجعه المختصّ ويقارنه بالبيانات الواقعية. (الدرس السابع)')
  ) as v(eid, t)
 where s.id = q.assessment_id and s.kind = 'post' and q.external_id = v.eid;

-- ------------------------------------- إجابة تُعاد: محاولات السؤال الواحد --
-- الدرجة المسجَّلة تُؤخذ من الإجابة الأولى وحدها، فيبقى للرقم دلالة بعد أن
-- صار الاختبار تعليميًّا يُعاد حتى الإتمام.
alter table attempt_response add column if not exists tries smallint not null default 1
  check (tries >= 1);
alter table attempt_response add column if not exists first_correct boolean;
update attempt_response set first_correct = is_correct where first_correct is null;

comment on column attempt_response.first_correct is
  'صواب الإجابة الأولى. لا يتغيّر بالإعادة، وهو ما يُبنى عليه مؤشّر لوحة المسؤول.';

-- الاختبار النهائي في النمط المفتوح: محاولة واحدة، وتمامه إصابة الجميع.
update assessment s set pass_mark = 1.000, max_attempts = 1
  from course c
 where c.id = s.course_id and c.mode = 'open' and s.kind = 'post';

-- التسجيلات القائمة في دورة صارت مفتوحة: تُفتح دروسها الآن لا عند أول نقرة،
-- كي تَصدُق الصفحة عن الحالة قبل أن يلمس المتعلّم شيئًا.
update lesson_progress lp set unlocked_at = coalesce(lp.unlocked_at, now())
  from enrolment e join course c on c.id = e.course_id
 where e.id = lp.enrolment_id and c.mode = 'open';

-- ------------------------------------------------------------- مساعدات ----
create or replace function enrolment_mode(p_enrolment uuid)
returns course_mode language sql stable as $$
  select c.mode from enrolment e join course c on c.id = e.course_id where e.id = p_enrolment
$$;

-- عدد الأسئلة الحيّة في تقييم، والمُتبقّي منها على محاولة بعينها.
create or replace function attempt_remaining(p_attempt uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
    from attempt a
    join question q on q.assessment_id = a.assessment_id and not q.retired
    left join attempt_response r on r.attempt_id = a.id and r.question_id = q.id
   where a.id = p_attempt and coalesce(r.is_correct, false) = false
$$;

-- --------------------------------------------------------- فتح الدورة -----
-- في النمط المفتوح لا بوّابة: الدروس الثمانية تُفتح معًا عند أول زيارة.
create or replace function open_course(p_enrolment uuid)
returns table (ok boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare v_t uuid; v_course uuid; v_first uuid; v_mode course_mode;
begin
  select e.tenant_id, e.course_id into v_t, v_course from enrolment e where e.id = p_enrolment;
  if v_t is null or v_t <> current_tenant() then
    return query select false, 'not_found'; return;
  end if;
  v_mode := enrolment_mode(p_enrolment);

  if v_mode = 'open' then
    update lesson_progress lp set unlocked_at = coalesce(lp.unlocked_at, now())
      from lesson l
     where l.id = lp.lesson_id and l.course_id = v_course and lp.enrolment_id = p_enrolment;
    update enrolment set state = 'in_progress' where id = p_enrolment and state = 'not_started';
    return query select true, 'all_unlocked'; return;
  end if;

  if not pre_assessment_done(p_enrolment) then
    return query select false, 'pre_assessment_required'; return;   -- ر١ في النمط المُقيّد
  end if;
  select l.id into v_first from lesson l where l.course_id = v_course order by l.no limit 1;
  update lesson_progress set unlocked_at = coalesce(unlocked_at, now())
   where enrolment_id = p_enrolment and lesson_id = v_first;
  update enrolment set state = 'in_progress' where id = p_enrolment and state = 'not_started';
  return query select true, 'unlocked';
end $$;

-- ------------------------------------------------------- إتمام الدرس ------
-- ر٢ كما هي في النمطين: التغطية المحسوبة وحدها تُتمّ الدرس. والفرق أن النمط
-- المفتوح لا يقفل شيئًا، فلا معنى لردّ «مقفل» فيه.
create or replace function complete_lesson(p_enrolment uuid, p_lesson uuid)
returns table (ok boolean, reason text, coverage numeric, required numeric, next_lesson_no smallint)
language plpgsql security definer set search_path = public as $$
declare
  v_t uuid; v_course uuid; v_no smallint; v_req numeric; v_cov numeric;
  v_unlocked timestamptz; v_mode course_mode;
begin
  select e.tenant_id, e.course_id into v_t, v_course from enrolment e where e.id = p_enrolment;
  if v_t is null or v_t <> current_tenant() then
    return query select false, 'not_found', null::numeric, null::numeric, null::smallint; return;
  end if;
  v_mode := enrolment_mode(p_enrolment);

  select l.no, l.required_watch_ratio into v_no, v_req
    from lesson l where l.id = p_lesson and l.course_id = v_course;
  if v_no is null then
    return query select false, 'lesson_not_in_course', null::numeric, null::numeric, null::smallint; return;
  end if;

  if v_mode = 'open' then
    update lesson_progress set unlocked_at = coalesce(unlocked_at, now())
     where enrolment_id = p_enrolment and lesson_id = p_lesson;
  else
    select lp.unlocked_at into v_unlocked
      from lesson_progress lp where lp.enrolment_id = p_enrolment and lp.lesson_id = p_lesson;
    if v_unlocked is null then
      return query select false, 'locked', null::numeric, v_req, null::smallint; return;  -- ر٣
    end if;
  end if;

  v_cov := lesson_coverage(p_enrolment, p_lesson);
  if v_cov < v_req then
    return query select false, 'insufficient_coverage', v_cov, v_req, null::smallint; return;  -- ر٢
  end if;

  update lesson_progress
     set completed_at = coalesce(completed_at, now()),
         watched_sec  = greatest(watched_sec,
                        (v_cov * (select end_sec - start_sec from lesson where id = p_lesson))::int)
   where enrolment_id = p_enrolment and lesson_id = p_lesson;

  return query select true, 'completed', v_cov, v_req, null::smallint;
end $$;

-- ------------------------------------------------------------ البوّابة ----
create or replace function assessment_gate(p_enrolment uuid, p_assessment uuid)
returns table (ok boolean, reason text, used smallint, allowed smallint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_t uuid; v_course uuid; v_kind assessment_kind; v_lesson uuid;
  v_max smallint; v_used smallint; v_passed boolean; v_prev_no smallint;
  v_open boolean; v_mode course_mode;
begin
  select e.tenant_id, e.course_id into v_t, v_course from enrolment e where e.id = p_enrolment;
  select s.kind, s.lesson_id, s.max_attempts into v_kind, v_lesson, v_max
    from assessment s where s.id = p_assessment and s.course_id = v_course;
  if v_t is null or v_t <> current_tenant() or v_kind is null then
    return query select false, 'not_found', 0::smallint, 0::smallint; return;
  end if;
  v_mode := enrolment_mode(p_enrolment);

  select count(*) filter (where a.submitted_at is not null)::smallint,
         bool_or(coalesce(a.passed, false)),
         bool_or(a.submitted_at is null)
    into v_used, v_passed, v_open
    from attempt a where a.enrolment_id = p_enrolment and a.assessment_id = p_assessment;

  -- اختبارات الدروس لا تُستعمل في النمط المفتوح، فتُغلق صراحةً لا ضمنًا.
  if v_mode = 'open' and v_kind = 'lesson' then
    return query select false, 'not_used_in_open_mode', v_used, v_max; return;
  end if;

  if coalesce(v_open, false) then
    return query select true, 'resumable', v_used, v_max; return;
  end if;

  if coalesce(v_passed, false) then
    return query select false, 'already_passed', v_used, v_max; return;
  end if;

  if v_kind = 'lesson' and not lesson_done(p_enrolment, v_lesson) then
    return query select false, 'lesson_not_complete', v_used, v_max; return;   -- ر٢ قبل ر٤
  end if;

  if v_kind = 'post' then
    -- المشاهدة وحدها هي الشرط في النمط المفتوح؛ وفي المُقيّد تُضاف اختبارات الدروس.
    select l.no into v_prev_no from lesson l
     where l.course_id = v_course
       and not (lesson_done(p_enrolment, l.id)
                and (v_mode = 'open' or lesson_quiz_passed(p_enrolment, l.id)))
     order by l.no limit 1;
    if v_prev_no is not null then
      return query select false, 'lessons_outstanding', v_used, v_max; return;
    end if;
  end if;

  if v_kind = 'pre' and pre_assessment_done(p_enrolment) then
    return query select false, 'already_submitted', v_used, v_max; return;
  end if;

  if v_used >= v_max then
    return query select false, 'no_attempts_left', v_used, v_max; return;      -- ر٦
  end if;

  return query select true, 'open', v_used, v_max;
end $$;

-- -------------------------------------------------------- ورقة المحاولة ---
-- تغيّر شكل المُخرَج، فلا بدّ من إسقاط الدالة قبل إعادة إنشائها.
drop function if exists attempt_paper(uuid);
create function attempt_paper(p_attempt uuid)
returns table (question_id uuid, external_id text, stem_ar text, q_pos smallint,
               option_id uuid, label text, text_ar text, o_pos smallint,
               chosen boolean, resolved boolean, tries smallint, explain_ar text)
language sql stable security definer set search_path = public as $$
  select q.id, q.external_id, q.stem_ar, q.position,
         o.id, o.label, o.text_ar, o.position,
         (r.option_id = o.id),
         coalesce(r.is_correct, false),
         coalesce(r.tries, 0)::smallint,
         case when coalesce(r.is_correct, false) or coalesce(r.tries, 0) > 0
              then q.explain_ar end
    from attempt a
    join question q on q.assessment_id = a.assessment_id and not q.retired
    join question_option o on o.question_id = q.id
    left join attempt_response r on r.attempt_id = a.id and r.question_id = q.id
   where a.id = p_attempt and a.tenant_id = current_tenant()
   order by q.position, o.position
$$;

-- ---------------------------------------------------- إجابة سؤال واحد -----
-- التصحيح الفوري. يُعيد الصواب وشرحه عند الخطأ — من الخادم بعد التسليم، لا
-- بتسليم المفتاح إلى الصفحة: الصفحة لا تعرف الصواب قبل أن تجيب.
create or replace function answer_question(p_attempt uuid, p_question uuid, p_option uuid)
returns table (ok boolean, reason text, correct boolean,
               correct_option_id uuid, explain_ar text, remaining int, all_done boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_t uuid; v_s uuid; v_sub timestamptz; v_ok boolean; v_was boolean;
  v_right uuid; v_explain text; v_left int;
begin
  select a.tenant_id, a.assessment_id, a.submitted_at into v_t, v_s, v_sub
    from attempt a where a.id = p_attempt;
  if v_t is null or v_t <> current_tenant() then
    return query select false, 'not_found', null::boolean, null::uuid, null::text, null::int, null::boolean; return;
  end if;
  if v_sub is not null then
    return query select false, 'already_submitted', null::boolean, null::uuid, null::text, null::int, null::boolean; return;
  end if;

  -- السؤال من هذا التقييم وغير متقاعد
  select q.explain_ar into v_explain from question q
   where q.id = p_question and q.assessment_id = v_s and not q.retired;
  if not found then
    return query select false, 'question_not_in_attempt', null::boolean, null::uuid, null::text, null::int, null::boolean; return;
  end if;

  select o.is_correct into v_ok from question_option o
   where o.id = p_option and o.question_id = p_question;
  if v_ok is null then
    return query select false, 'option_not_in_question', null::boolean, null::uuid, null::text, null::int, null::boolean; return;
  end if;

  -- سؤال أُصيب لا يُعاد: لا يُحتسب مرّتين ولا يُفتح بابًا لتغيير إجابة صحيحة.
  select r.is_correct into v_was from attempt_response r
   where r.attempt_id = p_attempt and r.question_id = p_question;
  if coalesce(v_was, false) then
    return query select false, 'already_correct', true, p_option, v_explain,
                        attempt_remaining(p_attempt), attempt_remaining(p_attempt) = 0; return;
  end if;

  insert into attempt_response (tenant_id, attempt_id, question_id, option_id, is_correct,
                                tries, first_correct)
  values (v_t, p_attempt, p_question, p_option, v_ok, 1, v_ok)
  on conflict (attempt_id, question_id) do update
    set option_id = excluded.option_id,
        is_correct = excluded.is_correct,
        tries = attempt_response.tries + 1,
        answered_at = now();

  if not v_ok then
    select o.id into v_right from question_option o
     where o.question_id = p_question and o.is_correct;
  else
    v_right := p_option;
  end if;

  v_left := attempt_remaining(p_attempt);
  return query select true, case when v_ok then 'correct' else 'wrong' end,
                      v_ok, v_right, case when v_ok then null else v_explain end,
                      v_left, v_left = 0;
end $$;

-- ------------------------------------------------------- تسليم المحاولة ---
-- الأسئلة المتقاعدة خارج الحساب، وإلّا لظلّت الدرجة ناقصة بسؤالين لا يراهما
-- المتعلّم أصلًا.
create or replace function submit_attempt(p_attempt uuid)
returns table (ok boolean, reason text, score numeric, pass_mark numeric, passed boolean,
               correct_n int, total_n int, unanswered_n int,
               next_lesson_no smallint, certificate_serial text)
language plpgsql security definer set search_path = public as $$
declare
  v_t uuid; v_e uuid; v_s uuid; v_kind assessment_kind; v_lesson uuid;
  v_mark numeric; v_course uuid; v_total int; v_answered int; v_correct int;
  v_score numeric; v_passed boolean; v_next uuid; v_next_no smallint;
  v_serial text; v_code text; v_name text; v_title text; v_n int;
  v_mode course_mode;
begin
  select a.tenant_id, a.enrolment_id, a.assessment_id into v_t, v_e, v_s
    from attempt a where a.id = p_attempt and a.submitted_at is null;
  if v_t is null or v_t <> current_tenant() then
    return query select false, 'not_found', null::numeric, null::numeric, null::boolean,
                        null::int, null::int, null::int, null::smallint, null::text; return;
  end if;

  select s.kind, s.lesson_id, s.pass_mark, s.course_id
    into v_kind, v_lesson, v_mark, v_course from assessment s where s.id = v_s;
  v_mode := enrolment_mode(v_e);

  select count(*)::int into v_total from question q
   where q.assessment_id = v_s and not q.retired;
  select count(*)::int, count(*) filter (where r.is_correct)::int
    into v_answered, v_correct
    from attempt_response r join question q on q.id = r.question_id and not q.retired
   where r.attempt_id = p_attempt;

  -- ما لم يُجَب يُحسب خطأً لا يُتخطّى. وورقة بيضاء تساوي صفرًا.
  v_score  := round(v_correct::numeric / greatest(v_total, 1), 3);
  v_passed := case when v_mark is null then null else v_score >= v_mark end;

  update attempt set submitted_at = now(), score = v_score, passed = v_passed
   where id = p_attempt;

  if v_kind = 'lesson' and v_passed then
    select l2.id, l2.no into v_next, v_next_no
      from lesson l1 join lesson l2 on l2.course_id = l1.course_id and l2.no = l1.no + 1
     where l1.id = v_lesson;
    if v_next is not null then
      update lesson_progress set unlocked_at = coalesce(unlocked_at, now())
       where enrolment_id = v_e and lesson_id = v_next;
    end if;
  end if;

  if v_kind = 'pre' then
    if v_mode = 'open' then
      -- القبلي هنا قياس لا بوّابة: الدروس مفتوحة قبله وبعده.
      update enrolment set state = 'in_progress' where id = v_e and state = 'not_started';
    else
      select l.id, l.no into v_next, v_next_no
        from lesson l where l.course_id = v_course order by l.no limit 1;
      update lesson_progress set unlocked_at = coalesce(unlocked_at, now())
       where enrolment_id = v_e and lesson_id = v_next;
      update enrolment set state = 'in_progress' where id = v_e and state = 'not_started';
    end if;
  end if;

  -- ر٧: شهادة واحدة لكل تسجيل، وببصمة لما تدّعيه.
  if v_kind = 'post' and v_passed then
    select u.full_name_ar, c.title_ar into v_name, v_title
      from enrolment e join app_user u on u.id = e.user_id
      join course c on c.id = e.course_id where e.id = v_e;
    select count(*)::int + 1 into v_n from certificate where tenant_id = v_t;
    v_serial := 'KHT-COP101-' || lpad(v_n::text, 6, '0');
    loop
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4) || '-' ||
                      substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
      exit when not exists (select 1 from certificate c where c.verify_code = v_code);
    end loop;
    insert into certificate (tenant_id, enrolment_id, serial, verify_code, issued_to_name,
                             course_title, score, content_hash)
    values (v_t, v_e, v_serial, v_code, v_name, v_title, v_score,
            sha256((v_serial || '|' || v_name || '|' || v_score::text)::bytea))
    on conflict (enrolment_id) do nothing;
    select c.serial into v_serial from certificate c where c.enrolment_id = v_e;
    update enrolment set state = 'completed' where id = v_e;
  end if;

  return query select true, 'submitted', v_score, v_mark, v_passed,
                      v_correct, v_total, v_total - v_answered, v_next_no, v_serial;
end $$;

-- ------------------------------------- مؤشّر إصابات المحاولة الأولى -------
-- رقم للوحة المسؤول وحدها: لا يمنع شهادة ولا يُعرض للمتعلّم.
create or replace view first_try_score with (security_invoker = true) as
  select a.enrolment_id,
         count(*) filter (where r.first_correct)::int as first_correct_n,
         count(*)::int                                as answered_n,
         (select count(*)::int from question q2
           where q2.assessment_id = a.assessment_id and not q2.retired) as total_n
    from attempt a
    join assessment s on s.id = a.assessment_id and s.kind = 'post'
    join attempt_response r on r.attempt_id = a.id
    join question q on q.id = r.question_id and not q.retired
   where a.submitted_at is not null
   group by a.enrolment_id, a.assessment_id;

-- ----------------------------------------- عزل الجهات في المناظر كذلك ----
-- عيب سابق لهذا التعديل: المنظر يعمل بصلاحيات مالكه، ومالكه هنا المستخدم
-- المؤسِّس الذي يتخطّى أمن الصفوف. فكان learning_gain يقرأ عبر الجهات ولا
-- يحميه إلا شرط enrolment_id في الصفحة — أي أن العزل صار في الصفحة بعد أن
-- وُضع في قاعدة البيانات عمدًا. security_invoker يعيده إلى موضعه.
alter view learning_gain set (security_invoker = true);

grant execute on function enrolment_mode(uuid)                      to khuta_app;
grant execute on function attempt_remaining(uuid)                   to khuta_app;
grant execute on function open_course(uuid)                         to khuta_app;
grant execute on function complete_lesson(uuid, uuid)               to khuta_app;
grant execute on function assessment_gate(uuid, uuid)               to khuta_app;
grant execute on function attempt_paper(uuid)                       to khuta_app;
grant execute on function answer_question(uuid, uuid, uuid)         to khuta_app;
grant execute on function submit_attempt(uuid)                      to khuta_app;
grant select on first_try_score                                     to khuta_app;

commit;
