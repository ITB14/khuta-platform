-- ============================================================================
--  تحليل الاحتياج التدريبي — فردي ومؤسسي.
--
--  الخطة التدريبية السنوية تُبنى اليوم في كثير من الجهات بالظنّ: يُسأل رؤساء
--  الإدارات في اجتماع، فيُكتب ما يُذكر في اللحظة. وما لا يُسجَّل لا يُحتسب،
--  ومن لم يحضر الاجتماع لا إدارة له في الخطة.
--
--  هذا الجدول يجعل الاحتياج **صفًّا مؤرَّخًا له صاحبٌ وسبب وحال**. ومنه تُبنى
--  الخطة في الوحدة التالية، فلا تُبنى من ذاكرة أحد.
--
--  ولماذا مصدران لا واحد: الموظف يُعلن ما يريد تعلّمه في ملفّه (قائم منذ وحدة
--  المهارات)، ورئيسه يرفع ما يراه لازمًا لعمل الإدارة. والاثنان مختلفان
--  اختلافًا حقيقيًّا — من يريد لا يُطابق دائمًا ما يلزم العمل — ودمجهما في
--  حقل واحد يُخفي الفرق الذي تُبنى عليه الأولويات.
-- ============================================================================
begin;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'need_scope') then
    create type need_scope as enum ('individual','department');
  end if;
  if not exists (select 1 from pg_type where typname = 'need_source') then
    create type need_source as enum ('self','manager','department','assessment');
  end if;
  if not exists (select 1 from pg_type where typname = 'need_status') then
    create type need_status as enum ('draft','submitted','approved','rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'need_priority') then
    create type need_priority as enum ('high','medium','low');
  end if;
end $$;

-- مرجع المفتاح المركّب: دورةٌ من الجهة نفسها لا من جهة أخرى.
-- يُضاف إن غاب ولا يُسقَط ثمّ يُضاف: المفاتيح الأجنبية أدناه تعتمد عليه،
-- فإسقاطه يُفشل إعادة تشغيل هذا الملف.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'course_tenant_id_uq') then
    alter table course add constraint course_tenant_id_uq unique (tenant_id, id);
  end if;
end $$;

create table if not exists training_need (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  cycle_year    smallint not null check (cycle_year between 2024 and 2100),
  scope         need_scope not null,
  department_id uuid,
  user_id       uuid,
  -- موضوع الاحتياج واحدٌ من ثلاثة: مهارة في الكتالوج، أو دورة قائمة، أو
  -- عنوانٌ حرّ لما لا وجود له بعد. والحرّ ضروري: أوّل احتياجٍ لموضوعٍ جديد
  -- يسبق وجود دورته، ولو لزمته دورة لما سُجِّل أصلًا.
  skill_id      uuid,
  course_id     uuid,
  title_ar      text,
  headcount     int not null default 1 check (headcount > 0),
  priority      need_priority not null default 'medium',
  source        need_source not null,
  justification text,
  status        need_status not null default 'draft',
  raised_by     uuid,
  decided_by    uuid,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now(),

  constraint training_need_subject_ck
    check (num_nonnulls(skill_id, course_id, title_ar) = 1),
  -- احتياج فردي بلا موظف، أو احتياج إدارة بلا إدارة، صفٌّ لا يُقرأ.
  constraint training_need_scope_ck
    check ((scope = 'individual' and user_id is not null)
        or (scope = 'department' and department_id is not null)),
  -- ولا يُرفع لفردٍ طلبٌ لعشرة.
  constraint training_need_headcount_ck
    check (scope = 'department' or headcount = 1)
);

alter table training_need drop constraint if exists training_need_dept_fk;
alter table training_need add constraint training_need_dept_fk
  foreign key (tenant_id, department_id) references department (tenant_id, id) on delete restrict;

alter table training_need drop constraint if exists training_need_user_fk;
alter table training_need add constraint training_need_user_fk
  foreign key (tenant_id, user_id) references app_user (tenant_id, id) on delete cascade;

alter table training_need drop constraint if exists training_need_skill_fk;
alter table training_need add constraint training_need_skill_fk
  foreign key (tenant_id, skill_id) references skill (tenant_id, id) on delete restrict;

alter table training_need drop constraint if exists training_need_course_fk;
alter table training_need add constraint training_need_course_fk
  foreign key (tenant_id, course_id) references course (tenant_id, id) on delete restrict;

create index if not exists training_need_cycle_ix on training_need (tenant_id, cycle_year, status);
create index if not exists training_need_dept_ix  on training_need (tenant_id, department_id);
create index if not exists training_need_user_ix  on training_need (tenant_id, user_id);

-- لا يُرفع الاحتياج نفسه مرّتين للموظف نفسه في الدورة نفسها. والموضوع قد
-- يكون أيًّا من الثلاثة، فالفهرس على الثلاثة مع nulls not distinct.
create unique index if not exists training_need_individual_uq
  on training_need (tenant_id, cycle_year, user_id, skill_id, course_id, title_ar)
  nulls not distinct
  where scope = 'individual';

alter table training_need enable row level security;
alter table training_need force  row level security;
drop policy if exists tenant_isolation on training_need;
create policy tenant_isolation on training_need
  using (tenant_id = current_tenant()) with check (tenant_id = current_tenant());

-- ------------------------------------------------- حارس الكتابة ----------
-- العزل بين الجهات تفرضه السياسة أعلاه. وهذا يفرض الفصل **داخل** الجهة عند
-- الكتابة: رئيس إدارة لا يرفع احتياجًا لإدارة ليست له ولا لموظّف لا يراه.
-- وحين لا يكون هناك فاعل (ترحيل، بذرة، مهمّة نظام) يمرّ الصفّ — فالقيد على
-- المستخدم لا على النظام.
create or replace function training_need_guard() returns trigger
language plpgsql as $$
begin
  if current_actor() is null or actor_is_tenant_wide() then
    return new;
  end if;

  if new.scope = 'department' then
    if new.department_id not in (select my_scope_departments()) then
      raise exception 'لا تملك رفع احتياج لهذه الإدارة' using errcode = 'insufficient_privilege';
    end if;
  else
    if not can_view_user(new.user_id) then
      raise exception 'لا تملك رفع احتياج لهذا الموظف' using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- الاعتماد ليس بيد من يرفع. ومن يرفع لنفسه لا يعتمد لنفسه.
  if new.status in ('approved','rejected') then
    raise exception 'الاعتماد أو الرفض من صلاحية الأكاديمية' using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

drop trigger if exists training_need_guard_t on training_need;
create trigger training_need_guard_t before insert or update on training_need
  for each row execute function training_need_guard();

-- ------------------------------------------------------- ما يراه القارئ --
-- النطاق نفسه الذي في visible_user: الأكاديمية ترى الجهة، ورئيس الإدارة يرى
-- إدارته وفروعها، والموظف يرى ما رُفع له.
create or replace view visible_training_need with (security_invoker = true) as
select n.*
  from training_need n
 where n.tenant_id = current_tenant()
   and ( actor_is_tenant_wide()
      or (n.scope = 'department' and n.department_id in (select my_scope_departments()))
      or (n.scope = 'individual' and can_view_user(n.user_id)) );

-- ------------------------------------------------------- رقم الأكاديمية --
-- السؤال الذي تُجيب عنه هذه الوحدة: **كم موظفًا يحتاج ماذا هذا العام؟**
-- والحساب في قاعدة البيانات لا في الصفحة، كي يُعاد إنتاج الرقم بالسؤال نفسه.
--
-- ويقرأ من `visible_training_need` لا من الجدول: فيرى منسّق التدريب رقم
-- الجهة، ويرى رئيس الإدارة رقم إدارته — كلٌّ يجمع ما يراه لا ما لا يراه.
create or replace view training_need_rollup with (security_invoker = true) as
select n.tenant_id,
       n.cycle_year,
       n.skill_id,
       n.course_id,
       n.title_ar,
       coalesce(s.name_ar, c.title_ar, n.title_ar)            as subject_ar,
       case when n.skill_id is not null then 'skill'
            when n.course_id is not null then 'course'
            else 'free' end                                   as subject_kind,
       count(*) filter (where n.scope = 'department')          as dept_entries,
       count(*) filter (where n.scope = 'individual')          as individual_entries,
       count(distinct n.department_id)                         as departments,
       sum(n.headcount)                                        as people,
       count(*) filter (where n.priority = 'high')             as high_priority,
       count(*) filter (where n.status = 'approved')           as approved_entries
  from visible_training_need n
  left join skill  s on s.tenant_id = n.tenant_id and s.id = n.skill_id
  left join course c on c.tenant_id = n.tenant_id and c.id = n.course_id
 where n.status in ('submitted','approved')
 group by n.tenant_id, n.cycle_year, n.skill_id, n.course_id, n.title_ar,
          s.name_ar, c.title_ar;

grant select, insert, update, delete on training_need to khuta_app;
grant select on visible_training_need  to khuta_app;
grant select on training_need_rollup   to khuta_app;

commit;
