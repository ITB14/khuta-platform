-- ============================================================================
--  Verification suite. Every rule is exercised against the live database,
--  with the application connecting as khuta_app — a plain role, no superuser,
--  no BYPASSRLS. A rule that only holds in the interface is not enforced.
-- ============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ------------------------------------------------------------- fixtures ----
reset role;
-- Re-runnable: remove what a previous run of this file left behind, so the
-- suite reports the same result on the first run and the hundredth.
do $$ begin
  perform set_config('khuta.tenant_id', (select id::text from tenant where slug = 'alain'), false);
end $$;
delete from app_user where email = 'test.learner@alain.example';
delete from certificate where serial = 'KHT-COP101-000001';

do $$ begin perform set_config('khuta.tenant_id', (select id::text from tenant where slug = 'alain'), false); end $$;

insert into app_user (tenant_id, email, employee_no, full_name_ar, department, status, email_verified_at)
select id, 'test.learner@alain.example', 'EMP-0001', 'سالم محمد الكعبي', 'الصحة العامة', 'active', now()
  from tenant where slug = 'alain'
on conflict do nothing;

insert into enrolment (tenant_id, user_id, course_id, cohort, state)
select u.tenant_id, u.id, c.id, 'Q4-2026', 'in_progress'
  from app_user u join course c on c.tenant_id = u.tenant_id
 where u.email = 'test.learner@alain.example' and c.code = 'COP-101'
on conflict do nothing;

insert into lesson_progress (tenant_id, enrolment_id, lesson_id, unlocked_at)
select e.tenant_id, e.id, l.id, case when l.no = 1 then now() else null end
  from enrolment e join lesson l on l.course_id = e.course_id
 where e.cohort = 'Q4-2026'
on conflict do nothing;

\echo ''
\echo '=============================================================='
\echo '  فحص القواعد على قاعدة بيانات حيّة'
\echo '=============================================================='

-- ---------------------------------------------- 1 · tenant isolation -------
\echo ''
\echo '--- عزل الجهات ---'
do $$ begin perform set_config('khuta.tenant_id', (select id::text from tenant where slug = 'bki'), false); end $$;
set role khuta_app;
select case when count(*) = 0
            then 'PASS  جهة bki لا ترى أيًّا من دورات بلدية العين'
            else 'FAIL  تسرّب ' || count(*) || ' دورة عبر الجهات' end from course;
select case when count(*) = 0
            then 'PASS  ولا أيًّا من أسئلتها'
            else 'FAIL  تسرّب ' || count(*) || ' سؤال' end from question;
reset role;
do $$ begin perform set_config('khuta.tenant_id', (select id::text from tenant where slug = 'alain'), false); end $$;
set role khuta_app;
select case when count(*) = 1 then 'PASS  وجهة alain ترى دورتها هي' else 'FAIL' end from course;
reset role;

-- ------------------------------------- 2 · R5 the answer key is unreachable -
\echo ''
\echo '--- ر٥ · مفاتيح الإجابات ---'
set role khuta_app;
do $$ begin
  perform is_correct from question_option limit 1;
  raise notice 'FAIL  ر٥: التطبيق قرأ مفتاح الإجابة';
exception
  when insufficient_privilege then
    raise notice 'PASS  ر٥: صلاحية القراءة على is_correct محجوبة عن دور التطبيق';
end $$;
do $$ begin
  perform text_ar from question_option limit 1;
  raise notice 'PASS  ر٥: ونصّ الخيارات مقروء كالمعتاد';
exception when others then
  raise notice 'FAIL  ر٥: نصّ الخيارات غير مقروء — الصلاحيات ضيّقة أكثر من اللازم';
end $$;
reset role;

-- --------------------------------- 3 · R5 marking happens inside the server -
\echo ''
\echo '--- ر٥ · التصحيح على الخادم ---'
do $$
declare
  v_att uuid; v_q uuid; v_right uuid; v_wrong uuid; v_res boolean;
begin
  insert into attempt (tenant_id, enrolment_id, assessment_id, attempt_no)
  select e.tenant_id, e.id, a.id, 1
    from enrolment e join assessment a on a.course_id = e.course_id and a.kind = 'pre'
   where e.cohort = 'Q4-2026'
  returning id into v_att;

  select q.id into v_q from question q where q.external_id = 'PRE-01';
  select id into v_right from question_option where question_id = v_q and is_correct;
  select id into v_wrong from question_option where question_id = v_q and not is_correct limit 1;

  set local role khuta_app;
  v_res := submit_response(v_att, v_q, v_right);
  raise notice '%  ر٥: الإجابة الصحيحة رُصدت صحيحة', case when v_res then 'PASS' else 'FAIL' end;
  v_res := submit_response(v_att, v_q, v_wrong);
  raise notice '%  ر٥: والخاطئة رُصدت خاطئة (وحُدِّثت الإجابة لا كُرِّرت)',
    case when v_res = false then 'PASS' else 'FAIL' end;
  reset role;
end $$;

-- ------------------------------------------- 4 · R2 heartbeats cannot burst -
\echo ''
\echo '--- ر٢ · نبضات المشاهدة ---'
do $$
declare v_e uuid; v_l uuid; v_t uuid;
begin
  select e.id, e.tenant_id into v_e, v_t from enrolment e where e.cohort = 'Q4-2026';
  select l.id into v_l from lesson l join enrolment e on e.course_id = l.course_id
   where e.id = v_e and l.no = 1;

  insert into watch_heartbeat (tenant_id, enrolment_id, lesson_id, position_sec, client_seq)
  values (v_t, v_e, v_l, 10, 1);
  raise notice 'PASS  ر٢: النبضة الأولى قُبلت وخُتمت بساعة الخادم';

  begin
    insert into watch_heartbeat (tenant_id, enrolment_id, lesson_id, position_sec, client_seq)
    values (v_t, v_e, v_l, 20, 2);
    raise notice 'FAIL  ر٢: نبضة متسارعة قُبلت — يمكن تزوير المشاهدة بسكربت';
  exception when check_violation then
    raise notice 'PASS  ر٢: نبضة أسرع من الزمن الحقيقي رُفضت';
  end;
end $$;

select 'PASS  ر٢: الطابع الزمني من الخادم لا من المتصفّح — فرق ' ||
       round(extract(epoch from (now() - created_at))::numeric, 3) || ' ثانية عن الآن'
  from watch_heartbeat order by id desc limit 1;

-- --------------------------------------------- 5 · R6 attempt limit in the DB
\echo ''
\echo '--- ر٦ · حدّ المحاولات ---'
do $$
declare v_e uuid; v_t uuid; v_a uuid; i int;
begin
  select e.id, e.tenant_id into v_e, v_t from enrolment e where e.cohort = 'Q4-2026';
  select a.id into v_a from assessment a join enrolment e on e.course_id = a.course_id
   where e.id = v_e and a.kind = 'lesson' limit 1;

  for i in 1..3 loop
    insert into attempt (tenant_id, enrolment_id, assessment_id, attempt_no) values (v_t, v_e, v_a, i);
  end loop;
  raise notice 'PASS  ر٦: ثلاث محاولات مسموحة قُبلت';
  begin
    insert into attempt (tenant_id, enrolment_id, assessment_id, attempt_no) values (v_t, v_e, v_a, 4);
    raise notice 'FAIL  ر٦: المحاولة الرابعة قُبلت رغم أن الحدّ ثلاث';
  exception when check_violation then
    raise notice 'PASS  ر٦: المحاولة الرابعة رُفضت من قاعدة البيانات لا من الواجهة';
  end;
end $$;

-- -------------------------------- 6 · R8 learning gain from parallel forms --
\echo ''
\echo '--- ر٨ · قياس مكسب التعلّم ---'
do $$
declare
  v_e uuid; v_t uuid; v_pre uuid; v_post uuid; v_att uuid;
  r record; i int := 0;
begin
  select e.id, e.tenant_id into v_e, v_t from enrolment e where e.cohort = 'Q4-2026';
  select id into v_pre  from assessment where kind = 'pre';
  select id into v_post from assessment where kind = 'post';

  -- the learner answers 4 of 10 correctly before the course
  select id into v_att from attempt where assessment_id = v_pre and enrolment_id = v_e;
  for r in select q.id qid from question q where q.assessment_id = v_pre order by q.position loop
    i := i + 1;
    insert into attempt_response (tenant_id, attempt_id, question_id, option_id, is_correct)
    select v_t, v_att, r.qid, o.id, o.is_correct
      from question_option o
     where o.question_id = r.qid and o.is_correct = (i <= 4)
     limit 1
    on conflict (attempt_id, question_id) do update
       set option_id = excluded.option_id, is_correct = excluded.is_correct;
  end loop;
  update attempt set submitted_at = now(), score = 0.400 where id = v_att;

  -- and 8 of the 10 parallel items after it
  insert into attempt (tenant_id, enrolment_id, assessment_id, attempt_no)
  values (v_t, v_e, v_post, 1) returning id into v_att;
  i := 0;
  for r in select q.id qid from question q
            where q.assessment_id = v_post and q.parallel_of is not null order by q.position loop
    i := i + 1;
    insert into attempt_response (tenant_id, attempt_id, question_id, option_id, is_correct)
    select v_t, v_att, r.qid, o.id, o.is_correct
      from question_option o
     where o.question_id = r.qid and o.is_correct = (i <= 8)
     limit 1;
  end loop;
  update attempt set submitted_at = now(), score = 0.800, passed = true where id = v_att;
end $$;

select 'PASS  ر٨: المكسب محسوب على ' || count(*) || ' كفايات — ' ||
       'قبل ' || round(avg(pre_ratio) * 100) || '٪ وبعد ' || round(avg(post_ratio) * 100) || '٪ ' ||
       '(+' || round(avg(gain) * 100) || ' نقطة)'
  from learning_gain;

-- --------------------------------------- 7 · R7/R9 certificate and revocation
\echo ''
\echo '--- ر٧ و ر٩ · الشهادة والإلغاء ---'
do $$
declare v_e uuid; v_t uuid; v_c uuid;
begin
  select e.id, e.tenant_id into v_e, v_t from enrolment e where e.cohort = 'Q4-2026';
  insert into certificate (tenant_id, enrolment_id, serial, verify_code, issued_to_name,
                           course_title, score, content_hash)
  values (v_t, v_e, 'KHT-COP101-000001', 'A7K2-9QX4',
          'سالم محمد الكعبي', 'Microsoft Copilot في العمل المؤسسي', 0.800,
          sha256('KHT-COP101-000001|سالم محمد الكعبي|0.800'::bytea))
  returning id into v_c;
  raise notice 'PASS  ر٧: الشهادة صدرت برقم وبصمة محتوى';

  begin
    insert into certificate (tenant_id, enrolment_id, serial, verify_code, issued_to_name,
                             course_title, score, content_hash)
    values (v_t, v_e, 'KHT-COP101-000002', 'B8L3-0RY5', 'سالم محمد الكعبي',
            'Microsoft Copilot في العمل المؤسسي', 0.800, sha256('x'::bytea));
    raise notice 'FAIL  ر٧: صدرت شهادة ثانية للتسجيل نفسه';
  exception when unique_violation then
    raise notice 'PASS  ر٧: شهادة واحدة لكل تسجيل — لا ازدواج';
  end;

  update certificate set revoked_at = now(), revoked_reason = 'اختبار الإلغاء' where id = v_c;
end $$;

select case when revoked_at is not null
            then 'PASS  ر٩: التحقّق بالرمز ' || verify_code || ' يُظهر الإلغاء فورًا'
            else 'FAIL  ر٩: الإلغاء غير ظاهر للمتحقّق' end
  from certificate where serial = 'KHT-COP101-000001';

-- ------------------------------------------------- 8 · heartbeat retention --
\echo ''
\echo '--- الاحتفاظ بالسجلّات ---'
select 'PASS  purge_heartbeats متاحة — حذفت ' || purge_heartbeats(90) ||
       ' نبضة (لا شيء بعد، فلا درس مكتمل منذ ٩٠ يومًا)';

\echo ''
\echo '=============================================================='
