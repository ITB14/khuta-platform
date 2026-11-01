-- ============================================================================
--  السجلّ والحوكمة — ثلاثة جداول وعد بها الـ ERD ولم تُبنَ.
--
--  ما يجمعها أنّ ما يُفقد منها بالتأخير لا يُستردّ: تحقّقٌ لم يُسجَّل لا
--  يُعاد تسجيله، وشهرٌ مضى بلا لقطة لا تُحسب أرقامه بأثر رجعي، ونبضاتٌ
--  تتراكم بلا قاعدة احتفاظ تصير حذفًا اضطراريًّا بلا سند بدل حذفٍ بقاعدة.
--
--  ١ · سجل التحقّق   — من تحقّق من شهادة، ومتى، وبأي نتيجة.
--  ٢ · لقطة الامتثال — رقم الشهر مجمّدًا، كي يوجد خطٌّ زمني أصلًا.
--  ٣ · قاعدة الاحتفاظ — مُعلَنة ومحسوبة، ولا تحذف شيئًا إلا بيد إنسان.
-- ============================================================================
begin;

-- ------------------------------------------------- ١ · سجل التحقّق --------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'verification_result') then
    create type verification_result as enum ('valid','revoked','not_found');
  end if;
end $$;

create table if not exists verification_log (
  id              uuid primary key default gen_random_uuid(),
  -- يقبل العدم: رمزٌ لم يُطابق شيئًا لا جهةَ له، ولا يُنسَب إلى جهة بالظنّ.
  tenant_id       uuid references tenant(id) on delete cascade,
  certificate_id  uuid references certificate(id) on delete set null,
  -- ما كُتب كما كُتب: تكرارُ رموزٍ خاطئة من مصدر واحد هو شكل التحسّس، ولا
  -- يُرى إن لم يُحفظ المكتوب.
  code_tried      text not null,
  result          verification_result not null,
  checked_at      timestamptz not null default now(),
  -- بصمةٌ لا عنوان: تكفي لتمييز المتكرّر ولا تُعرّف شخصًا.
  requester_hash  text
);

create index if not exists verification_log_by_cert
  on verification_log (certificate_id, checked_at desc);
create index if not exists verification_log_recent
  on verification_log (tenant_id, checked_at desc);

alter table verification_log enable row level security;
alter table verification_log force row level security;
drop policy if exists tenant_isolation on verification_log;
-- صفوف بلا جهة لا يراها أحد من المستأجرين: رمزٌ لم يُطابق شيئًا ليس خبرًا
-- لجهةٍ بعينها، وعرضُه على واحدة اعتباطٌ وتسريبٌ في آن.
create policy tenant_isolation on verification_log
  using (tenant_id = current_tenant()) with check (tenant_id = current_tenant());

grant select on verification_log to khuta_app;

-- صفحة التحقّق عامّة بلا جلسة، فالكتابة تجري داخل الدالّة نفسها بصلاحية
-- مالكها. والدالّة كانت stable فلا تكتب — صارت plpgsql تكتب ثم تُجيب.
create or replace function verify_certificate(
  p_code text,
  p_tenant uuid default null,          -- الجهة من اسم المضيف، للتسجيل فقط
  p_requester_hash text default null)
returns table (found boolean, serial text, issued_to_name text, course_title text,
               score numeric, issued_at timestamptz, revoked boolean, revoked_reason text,
               tenant_name_ar text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tenant uuid; v_revoked boolean;
begin
  select c.id, c.tenant_id, c.revoked_at is not null
    into v_id, v_tenant, v_revoked
    from certificate c
   where upper(replace(c.verify_code, '-', '')) = upper(replace(p_code, '-', ''));

  insert into verification_log (tenant_id, certificate_id, code_tried, result, requester_hash)
  values (coalesce(v_tenant, p_tenant), v_id, p_code,
          case when v_id is null then 'not_found'
               when v_revoked    then 'revoked'
               else 'valid' end::verification_result,
          p_requester_hash);

  return query
    select true, c.serial, c.issued_to_name, c.course_title, c.score, c.issued_at,
           c.revoked_at is not null, c.revoked_reason, t.name_ar
      from certificate c join tenant t on t.id = c.tenant_id
     where c.id = v_id;
end $$;

-- --------------------------------------------- ٢ · لقطة الامتثال ----------
--  منظر `department_progress` يقول «الآن»، ولا يقول «كيف كان». والفرق بين
--  الاثنين أنّ الأوّل يُحسب متى شئت والثاني يُفوَّت إن لم يُلتقط في حينه.
--
--  وكي لا يصير للحقيقة تعريفان، يُفكَّك المنظر القائم: تعريفٌ واحد بحسب
--  (الإدارة، الدورة)، والمنظر القديم يُعاد بناؤه فوقه بجمعٍ على الدورات،
--  واللقطة تُلتقط منه. فلو تغيّر معنى «متأخّر» يومًا تغيّر في موضع واحد.
create or replace view department_course_progress with (security_invoker = true) as
with per_enrolment as (
  select e.tenant_id,
         u.department_id,
         e.course_id,
         u.status,
         e.due_at,
         (select count(*) from lesson l where l.course_id = e.course_id)::int as lessons,
         (select count(*) from lesson_progress lp
            join lesson l2 on l2.id = lp.lesson_id
           where l2.course_id = e.course_id and lp.enrolment_id = e.id
             and lp.completed_at is not null)::int as done,
         exists (select 1 from certificate ct
                  where ct.enrolment_id = e.id and ct.revoked_at is null) as certified,
         (select max(a.score) from attempt a
            join assessment s on s.id = a.assessment_id
           where a.enrolment_id = e.id and s.kind = 'pre'
             and a.submitted_at is not null) as pre_score,
         (select max(a.score) from attempt a
            join assessment s on s.id = a.assessment_id
           where a.enrolment_id = e.id and s.kind = 'post'
             and a.submitted_at is not null) as post_score
    from enrolment e
    join app_user u on u.id = e.user_id
    join user_role_grant g on g.user_id = u.id and g.role = 'learner'
)
select tenant_id, department_id, course_id,
       count(*)::int                                                as enrolments,
       count(*) filter (where status = 'suspended')::int            as suspended,
       count(*) filter (where done > 0)::int                        as started,
       count(*) filter (where lessons > 0 and done >= lessons)::int as watched,
       count(*) filter (where certified)::int                       as certified,
       count(*) filter (where not certified and due_at is not null
                          and due_at < now())::int                  as overdue,
       count(*) filter (where pre_score is not null
                          and post_score is not null)::int          as measured,
       round(avg(post_score - pre_score)
             filter (where pre_score is not null and post_score is not null) * 100)::int
                                                                    as avg_gain
  from per_enrolment
 group by tenant_id, department_id, course_id;

grant select on department_course_progress to khuta_app;

-- المنظر القديم بسلوكه نفسه، مبنيًّا على الجديد. والمتوسّط موزون بعدد
-- المقيسين لا متوسّطَ متوسّطات — وهو القرار نفسه المسجَّل عند بنائه.
create or replace view department_progress with (security_invoker = true) as
select tenant_id, department_id,
       sum(enrolments)::int as enrolments,
       sum(suspended)::int  as suspended,
       sum(started)::int    as started,
       sum(watched)::int    as watched,
       sum(certified)::int  as certified,
       sum(overdue)::int    as overdue,
       sum(measured)::int   as measured,
       case when sum(measured) > 0
            then round(sum(avg_gain::numeric * measured) / sum(measured))::int end as avg_gain
  from department_course_progress
 group by tenant_id, department_id;

comment on view department_progress is
  'صفّ لكل إدارة، وصفّ بإدارة فارغة لمن لا إدارة له. المقام يشمل الموقوفين وعددهم مذكور.';

grant select on department_progress to khuta_app;

create table if not exists compliance_snapshot (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  period          text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  department_id   uuid,                       -- العدم = من لا إدارة له
  course_id       uuid not null references course(id) on delete cascade,
  enrolments      int not null default 0,
  started_count   int not null default 0,
  watched_count   int not null default 0,
  certified_count int not null default 0,
  overdue_count   int not null default 0,
  completion_pct  numeric(5,4),
  avg_gain        int,
  measured_count  int not null default 0,
  generated_at    timestamptz not null default now()
);

-- nulls not distinct: بلا هذا يصير «من لا إدارة له» صفًّا جديدًا كل مرّة،
-- لأن العدم في بوستجرس لا يساوي العدم في قيد التفرّد.
create unique index if not exists compliance_snapshot_key
  on compliance_snapshot (tenant_id, period, department_id, course_id) nulls not distinct;

alter table compliance_snapshot drop constraint if exists compliance_snapshot_department_fk;
alter table compliance_snapshot add constraint compliance_snapshot_department_fk
  foreign key (tenant_id, department_id) references department (tenant_id, id)
  on delete restrict;

alter table compliance_snapshot enable row level security;
alter table compliance_snapshot force row level security;
drop policy if exists tenant_isolation on compliance_snapshot;
create policy tenant_isolation on compliance_snapshot
  using (tenant_id = current_tenant()) with check (tenant_id = current_tenant());

grant select on compliance_snapshot to khuta_app;

--  تُستدعى فتُجمّد أرقام الشهر. والشهر الجاري يُحدَّث عند كل استدعاء لأنه لم
--  ينتهِ بعد؛ والشهور الماضية لا تُمسّ إلا باستدعاء صريح باسمها.
--
--  ولا مُجدوِل في المنصة، فاللقطة تُؤخذ عند فتح صفحة الحوكمة كما تُشتقّ
--  الإشعارات عند القراءة. وهذا يعني صراحةً: شهرٌ لم يفتح فيه أحدٌ الصفحة
--  لا لقطة له — وهو نقصٌ مُعلَن لا مُخبّأ، يزول بمُجدوِل خارجي ينادي الدالّة.
create or replace function take_compliance_snapshot(
  p_period text default to_char(now(), 'YYYY-MM'))
returns int
language plpgsql security definer set search_path = public as $$
declare v_t uuid := current_tenant(); v_n int;
begin
  if v_t is null then raise exception 'no tenant in scope'; end if;
  if p_period !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'صيغة الشهر YYYY-MM'; end if;

  insert into compliance_snapshot (tenant_id, period, department_id, course_id,
         enrolments, started_count, watched_count, certified_count, overdue_count,
         completion_pct, avg_gain, measured_count)
  select v_t, p_period, d.department_id, d.course_id,
         d.enrolments, d.started, d.watched, d.certified, d.overdue,
         (d.certified::numeric / nullif(d.enrolments, 0)),
         d.avg_gain, d.measured
    from department_course_progress d
   where d.tenant_id = v_t
  on conflict (tenant_id, period, department_id, course_id) do update
    set enrolments      = excluded.enrolments,
        started_count   = excluded.started_count,
        watched_count   = excluded.watched_count,
        certified_count = excluded.certified_count,
        overdue_count   = excluded.overdue_count,
        completion_pct  = excluded.completion_pct,
        avg_gain        = excluded.avg_gain,
        measured_count  = excluded.measured_count,
        generated_at    = now();

  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant execute on function take_compliance_snapshot(text) to khuta_app;

-- ------------------------------------------ ٣ · قاعدة الاحتفاظ ------------
create table if not exists retention_rule (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  entity_name  text not null,
  retain_months int not null check (retain_months between 1 and 240),
  legal_basis  text,
  -- معطَّلة عند الإنشاء عمدًا: الحذف لا يُستردّ، وتشغيلُه قرارُ إنسان لا
  -- أثرٌ جانبيٌّ لترحيلٍ يمرّ في النشر.
  is_active    boolean not null default false,
  last_run_at  timestamptz,
  last_run_rows int,
  unique (tenant_id, entity_name)
);

alter table retention_rule enable row level security;
alter table retention_rule force row level security;
drop policy if exists tenant_isolation on retention_rule;
create policy tenant_isolation on retention_rule
  using (tenant_id = current_tenant()) with check (tenant_id = current_tenant());

grant select, update on retention_rule to khuta_app;

-- النبضة دليلٌ تفصيليّ على المشاهدة، والملخّص الذي تُدافَع به الشهادة
-- (watched_sec و max_position_sec و completed_at) في lesson_progress ويبقى.
-- فحذف النبضة القديمة يُسقط التفصيل لا الحُجّة.
insert into retention_rule (tenant_id, entity_name, retain_months, legal_basis)
select id, 'watch_heartbeat', 3,
       'الـ ERD المعتمد: النبضات عالية الحجم، احتفاظ ٩٠ يومًا'
  from tenant
on conflict (tenant_id, entity_name) do nothing;

-- كم صفًّا تتجاوزه القاعدة اليوم — قراءة لا حذف، وهي ما تعرضه الصفحة.
create or replace function retention_due(p_entity text)
returns int
language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := current_tenant(); v_m int; v_n int;
begin
  select retain_months into v_m from retention_rule
   where tenant_id = v_t and entity_name = p_entity;
  if v_m is null then return 0; end if;
  if p_entity <> 'watch_heartbeat' then return 0; end if;
  select count(*) into v_n from watch_heartbeat
   where tenant_id = v_t and created_at < now() - make_interval(months => v_m);
  return v_n;
end $$;

-- التنفيذ: لا يعمل إلا على قاعدة مفعّلة، ولا يُستدعى إلا بضغطة من مسؤول.
create or replace function apply_retention(p_entity text)
returns int
language plpgsql security definer set search_path = public as $$
declare v_t uuid := current_tenant(); v_m int; v_on boolean; v_n int;
begin
  select retain_months, is_active into v_m, v_on from retention_rule
   where tenant_id = v_t and entity_name = p_entity;
  if v_m is null then raise exception 'لا قاعدة احتفاظ لهذا الكيان'; end if;
  if not v_on  then raise exception 'القاعدة معطَّلة — تُفعَّل أولًا'; end if;
  if p_entity <> 'watch_heartbeat' then raise exception 'كيان غير مدعوم'; end if;

  delete from watch_heartbeat
   where tenant_id = v_t and created_at < now() - make_interval(months => v_m);
  get diagnostics v_n = row_count;

  update retention_rule set last_run_at = now(), last_run_rows = v_n
   where tenant_id = v_t and entity_name = p_entity;

  insert into audit_log (tenant_id, actor_user_id, action, object_type, object_id, detail)
  values (v_t, current_actor(), 'retention.apply', 'retention_rule', null,
          jsonb_build_object('entity', p_entity, 'months', v_m, 'rows', v_n));
  return v_n;
end $$;

grant execute on function retention_due(text)  to khuta_app;
grant execute on function apply_retention(text) to khuta_app;

commit;
