-- ============================================================================
--  الإشعارات داخل المنصة.
--
--  لا بريد: لا SMTP في المنصة، وقولُ ذلك أصدق من إشعارٍ يُكتب ولا يصل. فما
--  هنا يظهر للموظف حين يدخل، لا يطرق بابه.
--
--  وما يُولَّد نوعان: حدثٌ وقع في لحظة (صدرت شهادتك)، وحالةٌ قائمة (اقترب
--  موعدك). الأوّل يُكتب عند وقوعه، والثاني يُشتقّ من الحالة عند القراءة —
--  لأن لا مُجدوِل في المنصة يمرّ كل ليلة. وقيد التفرّد هو ما يمنع الاشتقاق
--  المتكرّر من أن يصير طوفانًا.
-- ============================================================================
begin;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'notification_kind') then
    create type notification_kind as enum ('enrolled','due_soon','overdue','certificate','access_reset');
  end if;
end $$;

create table if not exists notification (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  user_id      uuid not null references app_user(id) on delete cascade,
  enrolment_id uuid references enrolment(id) on delete cascade,
  kind         notification_kind not null,
  title_ar     text not null,
  body_ar      text,
  href         text,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);

-- إشعار واحد لكل نوع لكل تسجيل. هذا ما يجعل الاشتقاق عند القراءة آمنًا:
-- يُنادى ألف مرة فيُكتب مرّة.
create unique index if not exists notification_once
  on notification (enrolment_id, kind) where enrolment_id is not null;

create index if not exists notification_inbox
  on notification (tenant_id, user_id, read_at, created_at desc);

alter table notification enable row level security;
alter table notification force row level security;
drop policy if exists tenant_isolation on notification;
create policy tenant_isolation on notification
  using (tenant_id = current_tenant()) with check (tenant_id = current_tenant());

grant select, insert, update, delete on notification to khuta_app;

-- ----------------------------------------------- اشتقاق إشعارات المواعيد --
-- تُنادى عند فتح المتعلّم لوحته أو صندوقه. لا تُنشئ إلا ما ينقص، ولا تُنشئ
-- شيئًا لمن أتمّ: من ناله شهادة لا يُذكَّر بموعد.
create or replace function refresh_due_notifications(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int := 0;
begin
  if p_user is null then return 0; end if;

  with candidate as (
    select e.id, e.tenant_id, e.user_id, e.due_at, co.title_ar,
           case when e.due_at < now() then 'overdue'::notification_kind
                else 'due_soon'::notification_kind end as kind
      from enrolment e
      join course co on co.id = e.course_id
     where e.user_id = p_user
       and e.tenant_id = current_tenant()
       and e.due_at is not null
       and e.due_at < now() + interval '3 days'
       and not exists (select 1 from certificate ct
                        where ct.enrolment_id = e.id and ct.revoked_at is null)
  ),
  ins as (
    insert into notification (tenant_id, user_id, enrolment_id, kind, title_ar, body_ar, href)
    select c.tenant_id, c.user_id, c.id, c.kind,
           case when c.kind = 'overdue' then 'تجاوزت موعد إتمام الدورة'
                else 'اقترب موعد إتمام دورتك' end,
           case when c.kind = 'overdue'
                then format('«%s» — كان الموعد %s. الدروس ما زالت مفتوحة لك.',
                            c.title_ar, to_char(c.due_at, 'YYYY/MM/DD'))
                else format('«%s» — الموعد %s.',
                            c.title_ar, to_char(c.due_at, 'YYYY/MM/DD')) end,
           '/dashboard'
      from candidate c
    on conflict (enrolment_id, kind) where enrolment_id is not null do nothing
    returning 1
  )
  select count(*)::int into v_n from ins;
  return v_n;
end $$;

grant execute on function refresh_due_notifications(uuid) to khuta_app;

-- ------------------------------------------- الشهادة تكتب إشعارها بنفسها --
-- عند الإصدار لا عند القراءة: هذا حدث وقع في لحظة ويُؤرَّخ بها.
create or replace function certificate_notify() returns trigger
language plpgsql as $$
declare v_user uuid;
begin
  select e.user_id into v_user from enrolment e where e.id = new.enrolment_id;
  insert into notification (tenant_id, user_id, enrolment_id, kind, title_ar, body_ar, href)
  values (new.tenant_id, v_user, new.enrolment_id, 'certificate',
          'صدرت شهادتك',
          format('«%s» — الرقم %s. تُطبع من صفحتها، ويُتحقّق منها برمزها.',
                 new.course_title, new.serial),
          '/certificate/' || new.serial)
  on conflict (enrolment_id, kind) where enrolment_id is not null do nothing;
  return new;
end $$;

drop trigger if exists certificate_notify_t on certificate;
create trigger certificate_notify_t after insert on certificate
  for each row execute function certificate_notify();

commit;
