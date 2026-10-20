-- ============================================================================
--  R2/R3 playback logic. All of it lives in the database so that the verdict
--  "this lesson is complete" is never something the browser asserts.
-- ============================================================================

-- Coverage is counted in ten-second buckets touched by a heartbeat, not in
-- elapsed time and not in the player's reported position. Seeking forward
-- creates no buckets, so skipping cannot manufacture coverage.
create or replace function lesson_coverage(p_enrolment uuid, p_lesson uuid)
returns numeric language sql stable as $$
  with l as (select greatest(end_sec - start_sec, 1) as dur from lesson where id = p_lesson),
       b as (select count(distinct (position_sec / 10)) as buckets
               from watch_heartbeat
              where enrolment_id = p_enrolment and lesson_id = p_lesson)
  select least(1.0, (b.buckets * 10.0) / l.dur)::numeric(5,4) from l, b;
$$;

-- R1: no lesson opens until the pre-assessment has been submitted.
create or replace function pre_assessment_done(p_enrolment uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from attempt a
      join assessment asm on asm.id = a.assessment_id
     where a.enrolment_id = p_enrolment and asm.kind = 'pre' and a.submitted_at is not null)
$$;

-- Opening the first lesson is the moment R1 is enforced.
create or replace function open_course(p_enrolment uuid)
returns table (ok boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare v_t uuid; v_course uuid; v_first uuid;
begin
  select e.tenant_id, e.course_id into v_t, v_course from enrolment e where e.id = p_enrolment;
  if v_t is null or v_t <> current_tenant() then
    return query select false, 'not_found'; return;
  end if;
  if not pre_assessment_done(p_enrolment) then
    return query select false, 'pre_assessment_required'; return;   -- R1
  end if;
  select l.id into v_first from lesson l where l.course_id = v_course order by l.no limit 1;
  update lesson_progress set unlocked_at = coalesce(unlocked_at, now())
   where enrolment_id = p_enrolment and lesson_id = v_first;
  update enrolment set state = 'in_progress' where id = p_enrolment and state = 'not_started';
  return query select true, 'unlocked';
end $$;

-- R2 + R3 together: a lesson completes only on proven coverage, and only then
-- does the next one open.
create or replace function complete_lesson(p_enrolment uuid, p_lesson uuid)
returns table (ok boolean, reason text, coverage numeric, required numeric, next_lesson_no smallint)
language plpgsql security definer set search_path = public as $$
declare
  v_t uuid; v_course uuid; v_no smallint; v_req numeric; v_cov numeric;
  v_unlocked timestamptz; v_next uuid; v_next_no smallint;
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
    return query select false, 'locked', null::numeric, v_req, null::smallint; return;  -- R3
  end if;

  v_cov := lesson_coverage(p_enrolment, p_lesson);
  if v_cov < v_req then
    return query select false, 'insufficient_coverage', v_cov, v_req, null::smallint; return;  -- R2
  end if;

  update lesson_progress
     set completed_at = coalesce(completed_at, now()),
         watched_sec  = greatest(watched_sec, (v_cov * (select end_sec - start_sec from lesson where id = p_lesson))::int)
   where enrolment_id = p_enrolment and lesson_id = p_lesson;

  select l.id, l.no into v_next, v_next_no
    from lesson l where l.course_id = v_course and l.no = v_no + 1;
  if v_next is not null then
    update lesson_progress set unlocked_at = coalesce(unlocked_at, now())
     where enrolment_id = p_enrolment and lesson_id = v_next;
  end if;

  return query select true, 'completed', v_cov, v_req, v_next_no;
end $$;

grant execute on function lesson_coverage(uuid, uuid)   to khuta_app;
grant execute on function pre_assessment_done(uuid)     to khuta_app;
grant execute on function open_course(uuid)             to khuta_app;
grant execute on function complete_lesson(uuid, uuid)   to khuta_app;
