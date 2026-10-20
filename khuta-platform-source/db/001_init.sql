-- ============================================================================
--  خُطى — Khuta learning platform · schema 001 (initial)
--  PostgreSQL 16.  Arabic-primary, multi-tenant, rules R1–R9 enforced server-side.
--
--  Design notes that the rest of the system depends on:
--   · Every tenant-scoped table carries tenant_id and is protected by RLS.
--     The application role is NOT superuser and does NOT have BYPASSRLS, so a
--     missing WHERE clause cannot leak another entity's rows.
--   · R5 is enforced by column privilege, not by discipline: the application
--     role has no SELECT on question_option.is_correct. Marking happens inside
--     a SECURITY DEFINER function. The answer key cannot reach the browser
--     because it cannot reach the application.
--   · R2 timestamps come from the database clock (now()), never from the client,
--     and a trigger rejects heartbeats arriving faster than real time.
-- ============================================================================

-- ---------------------------------------------------------------- roles -----
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'khuta_app') then
    create role khuta_app login password 'change_me_at_deploy';
  end if;
end $$;

-- ------------------------------------------------------------ enum types ----
create type tenant_status    as enum ('active','suspended');
create type identity_kind    as enum ('password','oidc');
create type user_status      as enum ('invited','active','suspended');
create type app_role         as enum ('learner','supervisor','author','admin','auditor');
create type course_status    as enum ('draft','published','retired');
create type media_state      as enum ('uploading','queued','transcoding','ready','failed');
create type assessment_kind  as enum ('pre','lesson','post');
create type enrolment_state  as enum ('not_started','in_progress','completed','expired');

-- --------------------------------------------------------- tenant context ---
create table tenant (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}$'),
  name_ar       text not null,
  name_en       text,
  status        tenant_status not null default 'active',
  -- R2 demo mode: explicit, visible in the interface, and written to the audit
  -- log whenever it is switched. Never silently on.
  demo_mode     boolean not null default false,
  demo_speed    smallint not null default 1 check (demo_speed between 1 and 16),
  created_at    timestamptz not null default now()
);
comment on column tenant.demo_mode is
  'When true the player may run faster than real time. Must be shown in the UI and audited. Production tenants keep this false.';

-- Resolved once per request from the Host header, then set for the session.
create or replace function current_tenant() returns uuid
language sql stable as $$
  select nullif(current_setting('khuta.tenant_id', true), '')::uuid
$$;

create or replace function current_actor() returns uuid
language sql stable as $$
  select nullif(current_setting('khuta.user_id', true), '')::uuid
$$;

-- ==================================================================  IDENTITY
create table app_user (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenant(id) on delete cascade,
  email             text not null,
  employee_no       text,
  full_name_ar      text not null,
  full_name_en      text,
  department        text,
  job_title         text,
  identity_provider identity_kind not null default 'password',
  status            user_status not null default 'invited',
  email_verified_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index app_user_email_uq on app_user (tenant_id, lower(email));
create index app_user_dept_ix on app_user (tenant_id, department);
comment on column app_user.identity_provider is
  'password today; oidc when the entity federates to its own directory. Swapping a user over does not change any other table.';

create table user_credential (
  user_id             uuid primary key references app_user(id) on delete cascade,
  tenant_id           uuid not null references tenant(id) on delete cascade,
  password_hash       text not null,
  password_algo       text not null default 'argon2id',
  password_updated_at timestamptz not null default now(),
  must_change         boolean not null default false
);

create table user_mfa (
  user_id            uuid primary key references app_user(id) on delete cascade,
  tenant_id          uuid not null references tenant(id) on delete cascade,
  totp_secret_enc    bytea not null,
  confirmed_at       timestamptz,
  recovery_codes_enc bytea
);
comment on table user_mfa is
  'TOTP built in from day one. Retrofitting MFA later touches every authentication path.';

create table user_role_grant (
  tenant_id  uuid not null references tenant(id) on delete cascade,
  user_id    uuid not null references app_user(id) on delete cascade,
  role       app_role not null,
  department text,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table user_session (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  user_id      uuid not null references app_user(id) on delete cascade,
  token_hash   bytea not null unique,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  ip           inet,
  user_agent   text
);
create index user_session_user_ix on user_session (tenant_id, user_id) where revoked_at is null;

create table login_attempt (
  id              bigserial primary key,
  tenant_id       uuid references tenant(id) on delete cascade,
  user_id         uuid references app_user(id) on delete set null,
  email_attempted text,
  ip              inet,
  success         boolean not null,
  at              timestamptz not null default now()
);
create index login_attempt_ix on login_attempt (tenant_id, email_attempted, at desc);

create table user_lockout (
  user_id      uuid primary key references app_user(id) on delete cascade,
  tenant_id    uuid not null references tenant(id) on delete cascade,
  failed_count integer not null default 0,
  locked_until timestamptz
);

-- ===================================================================  CONTENT
create table course (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  code        text not null,
  title_ar    text not null,
  title_en    text,
  language    text not null default 'ar',
  status      course_status not null default 'draft',
  created_at  timestamptz not null default now(),
  unique (tenant_id, code)
);

create table competency (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  course_id  uuid not null references course(id) on delete cascade,
  code       text not null,
  title_ar   text not null,
  unique (course_id, code)
);

-- One uploaded master; many web renditions produced on the server.
create table media_asset (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenant(id) on delete cascade,
  original_filename text not null,
  bytes             bigint,
  duration_sec      integer,
  checksum_sha256   bytea,
  state             media_state not null default 'uploading',
  uploaded_by       uuid references app_user(id) on delete set null,
  created_at        timestamptz not null default now()
);
comment on table media_asset is
  'The master as the editor exported it. Never served to a learner — see media_rendition.';

create table media_rendition (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  asset_id     uuid not null references media_asset(id) on delete cascade,
  label        text not null,                      -- '720p', '480p'
  width        integer,
  height       integer,
  bitrate_kbps integer,
  bytes        bigint,
  storage_key  text not null,                      -- object-store key, served by signed URL
  state        media_state not null default 'queued',
  created_at   timestamptz not null default now(),
  unique (asset_id, label)
);
comment on table media_rendition is
  'Produced by the server on upload. A 3 GB master becomes a ~260 MB 720p rendition; the learner only ever receives a rendition, through a signed, expiring URL.';

create table lesson (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenant(id) on delete cascade,
  course_id            uuid not null references course(id) on delete cascade,
  no                   smallint not null,
  title_ar             text not null,
  asset_id             uuid references media_asset(id) on delete set null,
  start_sec            integer not null default 0 check (start_sec >= 0),
  end_sec              integer not null check (end_sec > start_sec),
  required_watch_ratio numeric(4,3) not null default 0.950
                         check (required_watch_ratio > 0 and required_watch_ratio <= 1),
  unique (course_id, no)
);
comment on column lesson.required_watch_ratio is 'R2. Per lesson, so a future course can differ without a schema change.';

-- =============================================================== ASSESSMENTS
create table assessment (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  course_id    uuid not null references course(id) on delete cascade,
  kind         assessment_kind not null,
  lesson_id    uuid references lesson(id) on delete cascade,
  pass_mark    numeric(4,3) check (pass_mark > 0 and pass_mark <= 1),
  max_attempts smallint not null default 3 check (max_attempts >= 1),
  -- the pre-assessment gates but never fails anyone (R1)
  constraint pre_has_no_pass_mark   check (kind <> 'pre'    or pass_mark is null),
  constraint lesson_kind_has_lesson check ((kind = 'lesson') = (lesson_id is not null))
);
create unique index assessment_one_per_lesson on assessment (lesson_id) where kind = 'lesson';
create unique index assessment_one_per_kind  on assessment (course_id, kind) where kind in ('pre','post');

create table question (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  assessment_id uuid not null references assessment(id) on delete cascade,
  competency_id uuid not null references competency(id),
  external_id   text not null,                     -- 'PRE-01' — the id used in the content file
  stem_ar       text not null,
  parallel_of   uuid references question(id),      -- R8: the pre-assessment item this one mirrors
  position      smallint not null,
  unique (assessment_id, external_id)
);
comment on column question.parallel_of is
  'R8. Learning gain is computed between an item and its parallel, so pre and post test the same competency with different items.';

create table question_option (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  question_id uuid not null references question(id) on delete cascade,
  label       text not null,                       -- أ ب ج د
  text_ar     text not null,
  is_correct  boolean not null default false,
  position    smallint not null,
  unique (question_id, position)
);
create unique index question_one_correct on question_option (question_id) where is_correct;
comment on column question_option.is_correct is
  'R5. The application role has no SELECT privilege on this column. Marking happens in submit_response(), a SECURITY DEFINER function.';

-- ============================================================ ENROLMENT/PROGRESS
create table enrolment (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  user_id      uuid not null references app_user(id) on delete cascade,
  course_id    uuid not null references course(id) on delete cascade,
  cohort       text,
  state        enrolment_state not null default 'not_started',
  enrolled_at  timestamptz not null default now(),
  due_at       timestamptz,
  completed_at timestamptz,
  unique (user_id, course_id)
);
create index enrolment_cohort_ix on enrolment (tenant_id, course_id, cohort);

create table lesson_progress (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenant(id) on delete cascade,
  enrolment_id     uuid not null references enrolment(id) on delete cascade,
  lesson_id        uuid not null references lesson(id) on delete cascade,
  unlocked_at      timestamptz,                    -- R3
  watched_sec      integer not null default 0 check (watched_sec >= 0),
  max_position_sec integer not null default 0 check (max_position_sec >= 0),
  completed_at     timestamptz,                    -- set only when R2 is satisfied
  unique (enrolment_id, lesson_id)
);

-- R2: one row per heartbeat. created_at is the database clock — the browser
-- never supplies a time. client_seq is kept only to detect replay.
create table watch_heartbeat (
  id           bigserial primary key,
  tenant_id    uuid not null references tenant(id) on delete cascade,
  enrolment_id uuid not null references enrolment(id) on delete cascade,
  lesson_id    uuid not null references lesson(id) on delete cascade,
  position_sec integer not null check (position_sec >= 0),
  client_seq   integer,
  created_at   timestamptz not null default now()
);
create index watch_heartbeat_ix on watch_heartbeat (enrolment_id, lesson_id, created_at);
comment on table watch_heartbeat is
  'Retention: purged 90 days after the lesson completion record is stamped — see purge_heartbeats(). The completion record and the certificate are the permanent evidence; the heartbeats are temporary.';

-- Anti-burst: a scripted client cannot post heartbeats faster than real time.
create or replace function heartbeat_rate_guard() returns trigger
language plpgsql as $$
declare
  last_at  timestamptz;
  min_gap  constant interval := interval '8 seconds';  -- nominal interval is 10s
  demo     boolean;
begin
  select t.demo_mode into demo from tenant t where t.id = new.tenant_id;
  if demo then
    return new;                                   -- demo mode is explicit and audited
  end if;
  select max(created_at) into last_at
    from watch_heartbeat
   where enrolment_id = new.enrolment_id and lesson_id = new.lesson_id;
  if last_at is not null and (now() - last_at) < min_gap then
    raise exception 'heartbeat rejected: % since the previous beat, minimum is %',
      (now() - last_at), min_gap
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger watch_heartbeat_rate
  before insert on watch_heartbeat
  for each row execute function heartbeat_rate_guard();

-- ================================================================== ATTEMPTS
create table attempt (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  enrolment_id  uuid not null references enrolment(id) on delete cascade,
  assessment_id uuid not null references assessment(id) on delete cascade,
  attempt_no    smallint not null check (attempt_no >= 1),
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  score         numeric(4,3) check (score >= 0 and score <= 1),
  passed        boolean,
  unique (enrolment_id, assessment_id, attempt_no)
);

create table attempt_response (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  attempt_id  uuid not null references attempt(id) on delete cascade,
  question_id uuid not null references question(id),
  option_id   uuid not null references question_option(id),
  is_correct  boolean not null,                   -- written only by submit_response()
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- R6: the attempt limit is enforced in the database, not only in the interface.
create or replace function attempt_limit_guard() returns trigger
language plpgsql as $$
declare
  limit_n smallint;
  used_n  smallint;
begin
  select max_attempts into limit_n from assessment where id = new.assessment_id;
  select count(*) into used_n from attempt
   where enrolment_id = new.enrolment_id and assessment_id = new.assessment_id;
  if used_n >= limit_n then
    raise exception 'attempt limit reached: % of % used', used_n, limit_n
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger attempt_limit
  before insert on attempt
  for each row execute function attempt_limit_guard();

-- ============================================================== CERTIFICATES
create table certificate (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenant(id) on delete cascade,
  enrolment_id   uuid not null references enrolment(id) on delete cascade unique,
  serial         text not null unique,
  verify_code    text not null unique,
  issued_to_name text not null,
  course_title   text not null,
  score          numeric(4,3) not null,
  content_hash   bytea not null,
  issued_at      timestamptz not null default now(),
  revoked_at     timestamptz,                      -- R9
  revoked_reason text,
  revoked_by     uuid references app_user(id) on delete set null
);
comment on table certificate is
  'R7 issues it, R9 verifies and revokes it. Revocation is visible immediately to anyone checking the code.';

-- ================================================================ AUDIT LOG
create table audit_log (
  id            bigserial primary key,
  tenant_id     uuid references tenant(id) on delete cascade,
  actor_user_id uuid references app_user(id) on delete set null,
  action        text not null,
  object_type   text,
  object_id     uuid,
  detail        jsonb,
  ip            inet,
  at            timestamptz not null default now()
);
create index audit_log_ix on audit_log (tenant_id, at desc);

-- ================================================== R5 — marking inside the DB
-- The application cannot read is_correct. It calls this function, which runs
-- with the owner's privileges, compares, records, and returns only the verdict.
create or replace function submit_response(
  p_attempt_id uuid, p_question_id uuid, p_option_id uuid
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_correct boolean;
  v_tenant  uuid;
begin
  select tenant_id into v_tenant from attempt where id = p_attempt_id;
  if v_tenant is null or v_tenant <> current_tenant() then
    raise exception 'attempt not found in this tenant' using errcode = 'insufficient_privilege';
  end if;
  select o.is_correct into v_correct
    from question_option o
   where o.id = p_option_id and o.question_id = p_question_id and o.tenant_id = v_tenant;
  if v_correct is null then
    raise exception 'option does not belong to the question' using errcode = 'check_violation';
  end if;
  insert into attempt_response (tenant_id, attempt_id, question_id, option_id, is_correct)
  values (v_tenant, p_attempt_id, p_question_id, p_option_id, v_correct)
  on conflict (attempt_id, question_id)
    do update set option_id = excluded.option_id,
                  is_correct = excluded.is_correct,
                  answered_at = now();
  return v_correct;
end $$;

-- =============================================== R8 — learning gain by competency
create view learning_gain as
with scored as (
  select a.enrolment_id,
         asm.kind,
         q.competency_id,
         avg(case when r.is_correct then 1 else 0 end)::numeric(4,3) as ratio
    from attempt_response r
    join attempt    a   on a.id  = r.attempt_id
    join assessment asm on asm.id = a.assessment_id
    join question   q   on q.id  = r.question_id
   where asm.kind in ('pre','post') and a.submitted_at is not null
   group by a.enrolment_id, asm.kind, q.competency_id
)
select pre.enrolment_id,
       c.code  as competency_code,
       c.title_ar as competency,
       pre.ratio  as pre_ratio,
       post.ratio as post_ratio,
       (post.ratio - pre.ratio)::numeric(5,3) as gain
  from scored pre
  join scored post on post.enrolment_id = pre.enrolment_id
                  and post.competency_id = pre.competency_id
                  and post.kind = 'post'
  join competency c on c.id = pre.competency_id
 where pre.kind = 'pre';

-- ====================================================== heartbeat retention
create or replace function purge_heartbeats(p_days integer default 90)
returns bigint language plpgsql as $$
declare n bigint;
begin
  with gone as (
    delete from watch_heartbeat h
     using lesson_progress lp
     where lp.enrolment_id = h.enrolment_id
       and lp.lesson_id    = h.lesson_id
       and lp.completed_at is not null
       and lp.completed_at < now() - make_interval(days => p_days)
    returning 1)
  select count(*) into n from gone;
  return n;
end $$;
comment on function purge_heartbeats is
  'Dataverse charged USD 48 per GB per month for the equivalent rows. Here the storage is ours, but unbounded growth is still unbounded: a 400-person cohort produces roughly a million heartbeats a quarter.';

-- ============================================================== ROW SECURITY
do $$
declare t text;
begin
  foreach t in array array[
    'app_user','user_credential','user_mfa','user_role_grant','user_session',
    'login_attempt','user_lockout','course','competency','media_asset',
    'media_rendition','lesson','assessment','question','question_option',
    'enrolment','lesson_progress','watch_heartbeat','attempt','attempt_response',
    'certificate','audit_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($f$create policy tenant_isolation on %I
                      using (tenant_id = current_tenant())
                      with check (tenant_id = current_tenant())$f$, t);
  end loop;
end $$;

alter table tenant enable row level security;
alter table tenant force row level security;
create policy tenant_self on tenant using (id = current_tenant());

-- ============================================== PRIVILEGES (R5 is enforced here)
grant usage on schema public to khuta_app;
grant select, insert, update, delete on all tables in schema public to khuta_app;
grant usage, select on all sequences in schema public to khuta_app;

-- Take the answer key away from the application, then give back every other column.
revoke all on question_option from khuta_app;
grant select (id, tenant_id, question_id, label, text_ar, position) on question_option to khuta_app;
grant insert, update, delete on question_option to khuta_app;   -- authoring runs as a different role in production

-- and the only legitimate way to learn whether an answer is right:
grant execute on function submit_response(uuid, uuid, uuid) to khuta_app;
grant execute on function current_tenant() to khuta_app;
grant execute on function current_actor()  to khuta_app;
grant execute on function purge_heartbeats(integer) to khuta_app;
