-- ============================================================================
--  R4, R5, R6, R7, R9 — the assessment cycle.
--
--  Every decision here is the database's: which assessment a learner may open,
--  which option was correct, what the score is, whether it passes, whether the
--  next lesson opens, and whether a certificate exists. The browser is told the
--  outcome; it never computes one.
-- ============================================================================

-- ------------------------------------------------------------- helpers -----
create or replace function lesson_quiz_passed(p_enrolment uuid, p_lesson uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from attempt a
      join assessment s on s.id = a.assessment_id
     where a.enrolment_id = p_enrolment and s.kind = 'lesson'
       and s.lesson_id = p_lesson and a.passed)
$$;

create or replace function lesson_done(p_enrolment uuid, p_lesson uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from lesson_progress lp
     where lp.enrolment_id = p_enrolment and lp.lesson_id = p_lesson
       and lp.completed_at is not null)
$$;

-- Why an assessment is or is not open to this learner right now. One function,
-- so the dashboard and the API can never disagree about it.
create or replace function assessment_gate(p_enrolment uuid, p_assessment uuid)
returns table (ok boolean, reason text, used smallint, allowed smallint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_t uuid; v_course uuid; v_kind assessment_kind; v_lesson uuid;
  v_max smallint; v_used smallint; v_passed boolean; v_prev_no smallint;
begin
  select e.tenant_id, e.course_id into v_t, v_course from enrolment e where e.id = p_enrolment;
  select s.kind, s.lesson_id, s.max_attempts into v_kind, v_lesson, v_max
    from assessment s where s.id = p_assessment and s.course_id = v_course;
  if v_t is null or v_t <> current_tenant() or v_kind is null then
    return query select false, 'not_found', 0::smallint, 0::smallint; return;
  end if;

  select count(*)::smallint, bool_or(coalesce(a.passed, false))
    into v_used, v_passed
    from attempt a where a.enrolment_id = p_enrolment and a.assessment_id = p_assessment;

  if coalesce(v_passed, false) then
    return query select false, 'already_passed', v_used, v_max; return;
  end if;

  if v_kind = 'lesson' and not lesson_done(p_enrolment, v_lesson) then
    return query select false, 'lesson_not_complete', v_used, v_max; return;   -- R2 before R4
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
    return query select false, 'no_attempts_left', v_used, v_max; return;      -- R6
  end if;

  return query select true, 'open', v_used, v_max;
end $$;

-- ------------------------------------------------------- start an attempt --
-- An unsubmitted attempt is resumed rather than duplicated, so a refreshed
-- page or a dropped connection does not burn one of the learner's attempts.
create or replace function start_attempt(p_enrolment uuid, p_assessment uuid)
returns table (ok boolean, reason text, attempt_id uuid, attempt_no smallint, allowed smallint)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column   -- attempt_no is both an out parameter and a column
declare g record; v_open uuid; v_no smallint; v_new uuid;
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

  insert into attempt (tenant_id, enrolment_id, assessment_id, attempt_no)
  values (current_tenant(), p_enrolment, p_assessment, g.used + 1)
  returning id, attempt_no into v_new, v_no;
  return query select true, 'started', v_new, v_no, g.allowed;
end $$;

-- The paper the learner sees. is_correct is not in it, and could not be: the
-- application role has no privilege to read that column at all (R5).
create or replace function attempt_paper(p_attempt uuid)
returns table (question_id uuid, external_id text, stem_ar text, q_pos smallint,
               option_id uuid, label text, text_ar text, o_pos smallint,
               chosen boolean)
language sql stable security definer set search_path = public as $$
  select q.id, q.external_id, q.stem_ar, q.position,
         o.id, o.label, o.text_ar, o.position,
         (r.option_id = o.id)
    from attempt a
    join question q on q.assessment_id = a.assessment_id
    join question_option o on o.question_id = q.id
    left join attempt_response r on r.attempt_id = a.id and r.question_id = q.id
   where a.id = p_attempt and a.tenant_id = current_tenant()
   order by q.position, o.position
$$;

-- ------------------------------------------------------ submit an attempt --
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
begin
  select a.tenant_id, a.enrolment_id, a.assessment_id into v_t, v_e, v_s
    from attempt a where a.id = p_attempt and a.submitted_at is null;
  if v_t is null or v_t <> current_tenant() then
    return query select false, 'not_found', null::numeric, null::numeric, null::boolean,
                        null::int, null::int, null::int, null::smallint, null::text; return;
  end if;

  select s.kind, s.lesson_id, s.pass_mark, s.course_id
    into v_kind, v_lesson, v_mark, v_course from assessment s where s.id = v_s;

  select count(*)::int into v_total from question q where q.assessment_id = v_s;
  select count(*)::int, count(*) filter (where r.is_correct)::int
    into v_answered, v_correct from attempt_response r where r.attempt_id = p_attempt;

  -- Unanswered items are marked wrong, not skipped. A blank paper scores zero.
  v_score  := round(v_correct::numeric / greatest(v_total, 1), 3);
  v_passed := case when v_mark is null then null else v_score >= v_mark end;

  update attempt set submitted_at = now(), score = v_score, passed = v_passed
   where id = p_attempt;

  -- R4: passing the lesson quiz is what opens the next lesson, not the video.
  if v_kind = 'lesson' and v_passed then
    select l2.id, l2.no into v_next, v_next_no
      from lesson l1 join lesson l2 on l2.course_id = l1.course_id and l2.no = l1.no + 1
     where l1.id = v_lesson;
    if v_next is not null then
      update lesson_progress set unlocked_at = coalesce(unlocked_at, now())
       where enrolment_id = v_e and lesson_id = v_next;
    end if;
  end if;

  -- R1: submitting the pre-assessment is what opens lesson one.
  if v_kind = 'pre' then
    select l.id, l.no into v_next, v_next_no
      from lesson l where l.course_id = v_course order by l.no limit 1;
    update lesson_progress set unlocked_at = coalesce(unlocked_at, now())
     where enrolment_id = v_e and lesson_id = v_next;
    update enrolment set state = 'in_progress' where id = v_e and state = 'not_started';
  end if;

  -- R7: a certificate exists only for a passed post-assessment, one per
  -- enrolment, and carries a hash of what it asserts.
  if v_kind = 'post' and v_passed then
    select u.full_name_ar, c.title_ar into v_name, v_title
      from enrolment e join app_user u on u.id = e.user_id
      join course c on c.id = e.course_id where e.id = v_e;
    select count(*)::int + 1 into v_n from certificate where tenant_id = v_t;
    v_serial := 'KHT-COP101-' || lpad(v_n::text, 6, '0');
    -- Eight hex characters read off a printed page: no extension needed, and
    -- the alphabet has no letter that can be mistaken for a digit.
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

-- ------------------------------------------------------------ R9 verify ----
-- Public. Takes a code and returns only what a verifier needs, for any tenant,
-- and says plainly when a certificate has been revoked.
--
-- It must read across tenants, which is why it is SECURITY DEFINER. In this
-- build the owner is the superuser that created the schema; before production
-- the owner must be a dedicated nologin role with BYPASSRLS and no other
-- privilege, so that this one function — and nothing else — crosses the line.
create or replace function verify_certificate(p_code text)
returns table (found boolean, serial text, issued_to_name text, course_title text,
               score numeric, issued_at timestamptz, revoked boolean, revoked_reason text,
               tenant_name_ar text)
language sql stable security definer set search_path = public as $$
  select true, c.serial, c.issued_to_name, c.course_title, c.score, c.issued_at,
         c.revoked_at is not null, c.revoked_reason, t.name_ar
    from certificate c join tenant t on t.id = c.tenant_id
   where upper(replace(c.verify_code, '-', '')) = upper(replace(p_code, '-', ''))
$$;

-- ------------------------------------- R4 correction to the playback rule ---
-- complete_lesson used to open the next lesson on watched coverage alone. With
-- the quiz in place, coverage opens the quiz and the quiz opens the lesson.
create or replace function complete_lesson(p_enrolment uuid, p_lesson uuid)
returns table (ok boolean, reason text, coverage numeric, required numeric, next_lesson_no smallint)
language plpgsql security definer set search_path = public as $$
declare
  v_t uuid; v_course uuid; v_no smallint; v_req numeric; v_cov numeric; v_unlocked timestamptz;
begin
  select e.tenant_id, e.course_id into v_t, v_course from enrolment e where e.id = p_enrolment;
  if v_t is null or v_t <> current_tenant() then
    return query select false, 'not_found', null::numeric, null::numeric, null::smallint; return;
  end if;

  select l.no, l.required_watch_ratio into v_no, v_req
    from lesson l where l.id = p_lesson and l.course_id = v_course;
  if v_no is null then
    return query select false, 'lesson_not_in_course', null::numeric, null::numeric, null::smallint; return;
  end if;

  select lp.unlocked_at into v_unlocked
    from lesson_progress lp where lp.enrolment_id = p_enrolment and lp.lesson_id = p_lesson;
  if v_unlocked is null then
    return query select false, 'locked', null::numeric, v_req, null::smallint; return;        -- R3
  end if;

  v_cov := lesson_coverage(p_enrolment, p_lesson);
  if v_cov < v_req then
    return query select false, 'insufficient_coverage', v_cov, v_req, null::smallint; return; -- R2
  end if;

  update lesson_progress
     set completed_at = coalesce(completed_at, now()),
         watched_sec  = greatest(watched_sec,
                        (v_cov * (select end_sec - start_sec from lesson where id = p_lesson))::int)
   where enrolment_id = p_enrolment and lesson_id = p_lesson;

  -- The next lesson stays shut. The quiz is what opens it (R4).
  return query select true, 'completed', v_cov, v_req, null::smallint;
end $$;

grant execute on function lesson_quiz_passed(uuid, uuid)      to khuta_app;
grant execute on function lesson_done(uuid, uuid)             to khuta_app;
grant execute on function assessment_gate(uuid, uuid)         to khuta_app;
grant execute on function start_attempt(uuid, uuid)           to khuta_app;
grant execute on function attempt_paper(uuid)                 to khuta_app;
grant execute on function submit_attempt(uuid)                to khuta_app;
grant execute on function verify_certificate(text)            to khuta_app;
