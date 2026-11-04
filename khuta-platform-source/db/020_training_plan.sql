-- ============================================================================
--  الخطة التدريبية السنوية — من احتياجٍ معتمد إلى بندٍ يُختار منه.
--
--  الوحدة السابقة جمعت ما تحتاجه الإدارات. وهذه تحوّله إلى **خطة تُنشر**،
--  ثم يختار منها رئيس كل إدارة ما يناسب موظفيه. والمرحلتان مختلفتان حقًّا:
--  الاحتياج رغبةٌ تُرفع قبل أن تُعرف الموارد، والاختيار التزامٌ يُؤخذ على
--  خطةٍ منشورة لها بنودٌ ومقاعد. وخلطهما يجعل كل رغبةٍ وعدًا.
--
--  ولذلك ثلاثة جداول لا واحد:
--    الخطة   — وعاء الدورة، لها حالٌ واحد: مسوّدة، منشورة، مغلقة.
--    البند   — موضوعٌ في الخطة بعدد مقاعد مستهدف.
--    الاختيار — ما تطلبه إدارةٌ بعينها من بندٍ بعينه.
--
--  والجسر الذي يجعل الوحدة السابقة تؤتي ثمرتها هو `plan_items_from_needs`:
--  تبني بنود الخطة من الاحتياجات المعتمدة بدل أن تُكتب من جديد.
-- ============================================================================
begin;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'plan_status') then
    create type plan_status as enum ('draft','published','closed');
  end if;
end $$;

-- --------------------------------------------------------------- الخطة ---
create table if not exists training_plan (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  cycle_year   smallint not null check (cycle_year between 2024 and 2100),
  title_ar     text not null check (btrim(title_ar) <> ''),
  status       plan_status not null default 'draft',
  published_at timestamptz,
  published_by uuid,
  created_at   timestamptz not null default now(),
  unique (tenant_id, cycle_year),          -- خطةٌ واحدة للدورة، لا خطّتان
  unique (tenant_id, id)
);

alter table training_plan enable row level security;
alter table training_plan force  row level security;
drop policy if exists tenant_isolation on training_plan;
create policy tenant_isolation on training_plan
  using (tenant_id = current_tenant()) with check (tenant_id = current_tenant());

-- ---------------------------------------------------------------- البند --
create table if not exists plan_item (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  plan_id      uuid not null,
  skill_id     uuid,
  course_id    uuid,
  title_ar     text,
  provider_id  uuid,
  target_seats int not null default 0 check (target_seats >= 0),
  notes        text,
  sort         int not null default 100,
  created_at   timestamptz not null default now(),
  constraint plan_item_subject_ck check (num_nonnulls(skill_id, course_id, title_ar) = 1),
  unique (tenant_id, id)
);

alter table plan_item drop constraint if exists plan_item_plan_fk;
alter table plan_item add constraint plan_item_plan_fk
  foreign key (tenant_id, plan_id) references training_plan (tenant_id, id) on delete cascade;

alter table plan_item drop constraint if exists plan_item_skill_fk;
alter table plan_item add constraint plan_item_skill_fk
  foreign key (tenant_id, skill_id) references skill (tenant_id, id) on delete restrict;

alter table plan_item drop constraint if exists plan_item_course_fk;
alter table plan_item add constraint plan_item_course_fk
  foreign key (tenant_id, course_id) references course (tenant_id, id) on delete restrict;

alter table plan_item drop constraint if exists plan_item_provider_fk;
alter table plan_item add constraint plan_item_provider_fk
  foreign key (tenant_id, provider_id) references provider (tenant_id, id) on delete restrict;

-- الموضوع لا يتكرّر في الخطة الواحدة: بندان بالاسم نفسه يقسمان المقاعد
-- ويجعلان كل تقريرٍ عليهما خاطئًا.
create unique index if not exists plan_item_subject_uq
  on plan_item (plan_id, skill_id, course_id, title_ar) nulls not distinct;

create index if not exists plan_item_by_plan on plan_item (tenant_id, plan_id, sort);

alter table plan_item enable row level security;
alter table plan_item force  row level security;
drop policy if exists tenant_isolation on plan_item;
create policy tenant_isolation on plan_item
  using (tenant_id = current_tenant()) with check (tenant_id = current_tenant());

-- ------------------------------------------------------------- الاختيار --
create table if not exists plan_selection (
  tenant_id     uuid not null references tenant(id) on delete cascade,
  plan_item_id  uuid not null,
  department_id uuid not null,
  seats         int not null check (seats > 0),
  priority      need_priority not null default 'medium',
  note          text,
  selected_by   uuid,
  selected_at   timestamptz not null default now(),
  primary key (plan_item_id, department_id)
);

alter table plan_selection drop constraint if exists plan_selection_item_fk;
alter table plan_selection add constraint plan_selection_item_fk
  foreign key (tenant_id, plan_item_id) references plan_item (tenant_id, id) on delete cascade;

alter table plan_selection drop constraint if exists plan_selection_dept_fk;
alter table plan_selection add constraint plan_selection_dept_fk
  foreign key (tenant_id, department_id) references department (tenant_id, id) on delete restrict;

create index if not exists plan_selection_by_dept on plan_selection (tenant_id, department_id);

alter table plan_selection enable row level security;
alter table plan_selection force  row level security;
drop policy if exists tenant_isolation on plan_selection;
create policy tenant_isolation on plan_selection
  using (tenant_id = current_tenant()) with check (tenant_id = current_tenant());

-- ------------------------------------------------------------- الحرّاس ---
-- الخطة وبنودها من صلاحية الأكاديمية وحدها. ورئيس الإدارة يختار منها ولا
-- يكتب فيها — وهذا هو الفرق بين «خطة تُنشر» و«قائمة يعدّلها كل أحد».
-- `coalesce(new, old)` لا `new`: في مُحفِّزة BEFORE DELETE تكون new فارغة،
-- وإعادةُ الفارغ **تُلغي العملية بصمت** — حذفٌ يُقال عنه إنه تمّ ولم يتمّ.
create or replace function plan_owner_guard() returns trigger
language plpgsql as $$
begin
  if current_actor() is null or actor_is_tenant_wide() then return coalesce(new, old); end if;
  raise exception 'الخطة وبنودها من صلاحية الأكاديمية' using errcode = 'insufficient_privilege';
end $$;

drop trigger if exists training_plan_guard_t on training_plan;
create trigger training_plan_guard_t before insert or update or delete on training_plan
  for each row execute function plan_owner_guard();

drop trigger if exists plan_item_guard_t on plan_item;
create trigger plan_item_guard_t before insert or update or delete on plan_item
  for each row execute function plan_owner_guard();

-- والاختيار: إدارةٌ في نطاق المختار، وعلى خطةٍ منشورة لا مسوّدة ولا مغلقة.
create or replace function plan_selection_guard() returns trigger
language plpgsql as $$
declare v_status plan_status; v_dept uuid;
begin
  v_dept := coalesce(new.department_id, old.department_id);

  select p.status into v_status
    from plan_item i join training_plan p on p.id = i.plan_id
   where i.id = coalesce(new.plan_item_id, old.plan_item_id);

  if current_actor() is not null and not actor_is_tenant_wide() then
    if v_dept not in (select my_scope_departments()) then
      raise exception 'لا تملك الاختيار لهذه الإدارة' using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- الإغلاق يمنع **الالتزام الجديد** على الجميع، الأكاديمية معها: خطةٌ
  -- أُغلقت لا تُضاف إليها مقاعد. أمّا الحذف فيبقى للأكاديمية — تصحيحُ سجلٍّ
  -- قديم عملٌ مشروع، وبغيره يسقط حذف البند نفسه حين يسقط اختياره معه.
  if tg_op in ('INSERT','UPDATE') then
    if current_actor() is not null and v_status is distinct from 'published' then
      raise exception 'الاختيار لا يكون إلا على خطة منشورة' using errcode = 'insufficient_privilege';
    end if;
  else
    if current_actor() is not null and not actor_is_tenant_wide()
       and v_status is distinct from 'published' then
      raise exception 'لا يُحذف اختيارٌ على خطة غير منشورة' using errcode = 'insufficient_privilege';
    end if;
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists plan_selection_guard_t on plan_selection;
create trigger plan_selection_guard_t before insert or update or delete on plan_selection
  for each row execute function plan_selection_guard();

-- --------------------------------------------------- الجسر من الاحتياج --
/**
 * تبني بنود الخطة من الاحتياجات **المعتمدة** في دورتها.
 * ولا تلمس بندًا قائمًا: المقاعد قد تكون عُدِّلت بقرار، فإعادة التشغيل
 * تُضيف الجديد ولا تمحو ما قُرِّر.
 */
create or replace function plan_items_from_needs(p_plan uuid)
returns int language plpgsql as $$
declare v_cycle smallint; v_tenant uuid; v_n int;
begin
  if not actor_is_tenant_wide() and current_actor() is not null then
    raise exception 'بناء البنود من صلاحية الأكاديمية' using errcode = 'insufficient_privilege';
  end if;

  select cycle_year, tenant_id into v_cycle, v_tenant
    from training_plan where id = p_plan;
  if v_cycle is null then raise exception 'لا خطة بهذا المعرّف'; end if;

  insert into plan_item (tenant_id, plan_id, skill_id, course_id, title_ar, target_seats)
  select v_tenant, p_plan, n.skill_id, n.course_id, n.title_ar, sum(n.headcount)::int
    from training_need n
   where n.tenant_id = v_tenant and n.cycle_year = v_cycle and n.status = 'approved'
   group by n.skill_id, n.course_id, n.title_ar
  on conflict (plan_id, skill_id, course_id, title_ar) do nothing;

  get diagnostics v_n = row_count;

  insert into audit_log (tenant_id, actor_user_id, action, object_type, object_id, detail)
  values (v_tenant, current_actor(), 'plan.build_from_needs', 'training_plan', p_plan,
          jsonb_build_object('cycle', v_cycle, 'items', v_n));
  return v_n;
end $$;

-- ------------------------------------------------------------ المناظر ---
-- المسوّدة للأكاديمية وحدها: خطةٌ لم تُنشر بعد ليست وعدًا لأحد.
create or replace view visible_plan_item with (security_invoker = true) as
select i.*, p.cycle_year, p.status as plan_status, p.title_ar as plan_title
  from plan_item i
  join training_plan p on p.tenant_id = i.tenant_id and p.id = i.plan_id
 where i.tenant_id = current_tenant()
   and (actor_is_tenant_wide() or p.status in ('published','closed'));

-- البند وما اختير عليه: المستهدف مقابل المطلوب، وهو السؤال الذي تُبنى عليه
-- الجلسات في الوحدة التالية.
create or replace view plan_item_rollup with (security_invoker = true) as
select i.id as plan_item_id, i.tenant_id, i.plan_id, i.cycle_year, i.plan_status,
       coalesce(s.name_ar, c.title_ar, i.title_ar) as subject_ar,
       case when i.skill_id is not null then 'skill'
            when i.course_id is not null then 'course'
            else 'free' end                        as subject_kind,
       pr.name_ar                                   as provider_ar,
       i.target_seats,
       coalesce(sel.seats, 0)                       as selected_seats,
       coalesce(sel.departments, 0)                 as departments,
       nd.need_people
  from visible_plan_item i
  left join skill    s  on s.tenant_id  = i.tenant_id and s.id  = i.skill_id
  left join course   c  on c.tenant_id  = i.tenant_id and c.id  = i.course_id
  left join provider pr on pr.tenant_id = i.tenant_id and pr.id = i.provider_id
  left join lateral (
    select sum(x.seats)::int as seats, count(*)::int as departments
      from plan_selection x where x.plan_item_id = i.id
  ) sel on true
  left join lateral (
    select sum(n.headcount)::int as need_people
      from training_need n
     where n.tenant_id = i.tenant_id and n.cycle_year = i.cycle_year
       and n.status = 'approved'
       and n.skill_id  is not distinct from i.skill_id
       and n.course_id is not distinct from i.course_id
       and n.title_ar  is not distinct from i.title_ar
  ) nd on true;

grant select, insert, update, delete on training_plan  to khuta_app;
grant select, insert, update, delete on plan_item      to khuta_app;
grant select, insert, update, delete on plan_selection to khuta_app;
grant select on visible_plan_item  to khuta_app;
grant select on plan_item_rollup   to khuta_app;
grant execute on function plan_items_from_needs(uuid) to khuta_app;

commit;
