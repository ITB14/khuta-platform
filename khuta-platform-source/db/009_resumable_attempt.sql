-- ============================================================================
--  إصلاح: محاولة مفتوحة لم تُسلَّم ليست محاولة مستهلَكة.
--
--  كانت assessment_gate تعدّ كل صفوف المحاولات، فإذا فتح المتعلّم تقييمًا حدّه
--  محاولة واحدة ثم غادر الصفحة دون تسليم، أعادت البوّابة «استُنفدت المحاولات»
--  وأُغلق التقييم في وجهه إلى الأبد — مع أن start_attempt نفسها كانت تستأنف
--  تلك المحاولة لو وصلت إليها. فالصفحة كانت تمنع قبل أن يصل الأمر إليها.
--
--  القاعدة الصحيحة: المحاولة تُحتسب عند التسليم لا عند الفتح. وما دامت هناك
--  محاولة مفتوحة فالتقييم مفتوح، وهي تُستأنف بإجاباتها المحفوظة.
-- ============================================================================

create or replace function assessment_gate(p_enrolment uuid, p_assessment uuid)
returns table (ok boolean, reason text, used smallint, allowed smallint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_t uuid; v_course uuid; v_kind assessment_kind; v_lesson uuid;
  v_max smallint; v_used smallint; v_passed boolean; v_prev_no smallint;
  v_open boolean;
begin
  select e.tenant_id, e.course_id into v_t, v_course from enrolment e where e.id = p_enrolment;
  select s.kind, s.lesson_id, s.max_attempts into v_kind, v_lesson, v_max
    from assessment s where s.id = p_assessment and s.course_id = v_course;
  if v_t is null or v_t <> current_tenant() or v_kind is null then
    return query select false, 'not_found', 0::smallint, 0::smallint; return;
  end if;

  -- المحاولات المحتسَبة هي المسلَّمة وحدها
  select count(*) filter (where a.submitted_at is not null)::smallint,
         bool_or(coalesce(a.passed, false)),
         bool_or(a.submitted_at is null)
    into v_used, v_passed, v_open
    from attempt a where a.enrolment_id = p_enrolment and a.assessment_id = p_assessment;

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
    select l.no into v_prev_no from lesson l
     where l.course_id = v_course
       and not (lesson_done(p_enrolment, l.id) and lesson_quiz_passed(p_enrolment, l.id))
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

-- start_attempt كانت تحسب رقم المحاولة من إجمالي الصفوف؛ وقد صار used يعدّ
-- المسلَّمة وحدها، فيُحسب الرقم هنا من الصفوف مباشرة.
create or replace function start_attempt(p_enrolment uuid, p_assessment uuid)
returns table (ok boolean, reason text, attempt_id uuid, attempt_no smallint, allowed smallint)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare g record; v_open uuid; v_no smallint; v_new uuid; v_rows smallint;
begin
  select * into g from assessment_gate(p_enrolment, p_assessment);

  select a.id, a.attempt_no into v_open, v_no from attempt a
   where a.enrolment_id = p_enrolment and a.assessment_id = p_assessment
     and a.submitted_at is null order by a.attempt_no desc limit 1;
  if v_open is not null then
    return query select true, 'resumed', v_open, v_no, g.allowed; return;
  end if;

  if not g.ok then
    return query select false, g.reason, null::uuid, null::smallint, g.allowed; return;
  end if;

  select count(*)::smallint into v_rows from attempt a
   where a.enrolment_id = p_enrolment and a.assessment_id = p_assessment;

  insert into attempt (tenant_id, enrolment_id, assessment_id, attempt_no)
  values (current_tenant(), p_enrolment, p_assessment, v_rows + 1)
  returning id, attempt_no into v_new, v_no;
  return query select true, 'started', v_new, v_no, g.allowed;
end $$;

grant execute on function assessment_gate(uuid, uuid) to khuta_app;
grant execute on function start_attempt(uuid, uuid)   to khuta_app;
