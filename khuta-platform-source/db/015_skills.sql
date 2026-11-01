-- ============================================================================
--  المهارات — جردٌ يُعلنه الموظف، وطلبٌ على التعلّم يُقرأ منه.
--
--  المنصة تحمل دورة واحدة وأربعًا موعودة. والسؤال الذي يسبق تصويرها: أيّها
--  أولى؟ الجواب اليوم تخمين، وهنا يصير رقمًا: كم موظفًا قال «أريد أن أتعلّم
--  هذه» وفي أيّ إدارة.
--
--  ولذلك الإعلان ثلاث حالات لا حالة: ما يتقنه الموظف، وما هو فيه الآن، وما
--  يريده. الثالثة وحدها هي التي تُخطَّط عليها الدورة القادمة، ولا تظهر إن
--  اكتفينا بـ«يملك المهارة أو لا».
--
--  والكتالوج مُعرَّف لا حرّ، للسبب نفسه الذي عُرِّفت به الإدارات: أربعون
--  كتابةً لمهارة واحدة تُفسد العدّ الذي وُجد الجدول لأجله.
-- ============================================================================
begin;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'skill_stance') then
    -- has: يتقنها · learning: يتعلّمها الآن · wants: يريد تعلّمها
    create type skill_stance as enum ('has','learning','wants');
  end if;
end $$;

create table if not exists skill (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  name_ar     text not null check (btrim(name_ar) <> ''),
  name_en     text,
  category    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, name_ar),
  unique (tenant_id, id)
);

create table if not exists user_skill (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  user_id    uuid not null references app_user(id) on delete cascade,
  skill_id   uuid not null,
  stance     skill_stance not null,
  added_at   timestamptz not null default now(),
  unique (user_id, skill_id)
);

-- المهارة من جهة الموظف نفسها. مفتاح مركّب لا مفتاح على المعرّف وحده.
alter table user_skill drop constraint if exists user_skill_skill_fk;
alter table user_skill add constraint user_skill_skill_fk
  foreign key (tenant_id, skill_id) references skill (tenant_id, id)
  on delete restrict;

create index if not exists user_skill_by_skill on user_skill (tenant_id, skill_id, stance);
create index if not exists user_skill_by_user  on user_skill (tenant_id, user_id);

alter table skill enable row level security;
alter table skill force row level security;
drop policy if exists tenant_isolation on skill;
create policy tenant_isolation on skill
  using (tenant_id = current_tenant()) with check (tenant_id = current_tenant());

alter table user_skill enable row level security;
alter table user_skill force row level security;
drop policy if exists tenant_isolation on user_skill;
create policy tenant_isolation on user_skill
  using (tenant_id = current_tenant()) with check (tenant_id = current_tenant());

grant select, insert, update, delete on skill      to khuta_app;
grant select, insert, update, delete on user_skill to khuta_app;

-- ------------------------------------------------- الطلب على التعلّم -----
-- لماذا منظر لا استعلام في الصفحة: هذا الرقم يُرفع إلى الجهة ليُبنى عليه
-- قرار تصوير دورة. فليُعَد إنتاجه بالسؤال نفسه، لا بشيفرة صفحة قد تتغيّر.
create or replace view skill_demand with (security_invoker = true) as
select s.tenant_id,
       s.id                                                   as skill_id,
       s.name_ar,
       s.category,
       s.is_active,
       count(*) filter (where us.stance = 'wants')::int        as wants,
       count(*) filter (where us.stance = 'learning')::int     as learning,
       count(*) filter (where us.stance = 'has')::int          as has,
       count(us.id)::int                                       as declared
  from skill s
  left join user_skill us on us.skill_id = s.id
 group by s.tenant_id, s.id, s.name_ar, s.category, s.is_active;

comment on view skill_demand is
  'صفّ لكل مهارة. wants هو الطلب: من قال «أريد أن أتعلّمها» — وعليه يُبنى قرار الدورة القادمة.';

-- والطلب موزّعًا على الإدارات: مهارة يريدها عشرون في إدارة واحدة ليست
-- كمهارة يريدها عشرون متفرّقون في عشرين إدارة.
create or replace view skill_demand_by_department with (security_invoker = true) as
select us.tenant_id,
       us.skill_id,
       s.name_ar          as skill_name,
       u.department_id,
       count(*) filter (where us.stance = 'wants')::int as wants
  from user_skill us
  join skill s     on s.id = us.skill_id
  join app_user u  on u.id = us.user_id
 group by us.tenant_id, us.skill_id, s.name_ar, u.department_id;

grant select on skill_demand                to khuta_app;
grant select on skill_demand_by_department  to khuta_app;

commit;
