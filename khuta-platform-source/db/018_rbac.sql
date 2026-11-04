-- ============================================================================
--  الأدوار والنطاق الإداري — من «متعلّم أو مسؤول» إلى أكاديمية لها هيكل.
--
--  كانت المنصة تعرف صنفين: متعلّمًا يرى نفسه، ومسؤولًا يرى الجهة كلّها.
--  وأكاديمية التدريب البلدي تحتاج صنفًا ثالثًا هو الأكثر عددًا: **رئيس إدارة**
--  يرى موظفي إدارته ولا يرى غيرهم. وهذا ليس تفصيلًا في الواجهة: قائمة أسماء
--  موظفي إدارةٍ أخرى مع حالة تدريبهم بيانات لا يملكها.
--
--  ولماذا الآن قبل أي شاشة جديدة: إضافة نطاقٍ إلى عشر شاشات قائمة تعني إعادة
--  مراجعتها واحدةً واحدة. والنطاق المبنيّ أولًا تَرِثه كل شاشة تُكتب بعده.
--
--  وأين يُفرض: هنا، في قاعدة البيانات. دالّة `can_view_user` هي الحَكَم،
--  ومنظر `visible_user` يقرأ منها — فمن عدّل رقمًا في رابط لا يرى شيئًا، ولا
--  تتكرّر القاعدة في كل صفحة لتختلف نسخُها.
-- ============================================================================
begin;

-- ------------------------------------------------------------- الأدوار ----
-- القيم الجديدة تُضاف ولا يُعاد تعريف النوع: 'learner' و'admin' قائمان في
-- صفوف فعلية. و'provider_user' يُعرَّف اليوم بلا صلاحية واحدة — المعاهد
-- الخارجية في موجة لاحقة، وإضافة قيمة إلى نوعٍ مستعمل لاحقًا أغلى من تعريفها
-- فارغة الآن.
alter type app_role add value if not exists 'dept_head';
alter type app_role add value if not exists 'training_officer';
alter type app_role add value if not exists 'academy_director';
alter type app_role add value if not exists 'provider_user';

-- مرجعٌ للمفاتيح المركّبة أدناه. بدونه يمكن ربط رئيسٍ من جهةٍ بإدارة جهةٍ
-- أخرى، والعزل قائم فلا يراه أحد حتى يقع.
-- يُضاف إن غاب ولا يُسقَط ثمّ يُضاف: مفاتيح أجنبية لاحقة تعتمد عليه، فإسقاطه
-- يُفشل إعادة تشغيل هذا الملف.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'app_user_tenant_id_uq') then
    alter table app_user add constraint app_user_tenant_id_uq unique (tenant_id, id);
  end if;
end $$;

-- --------------------------------------------------- رئاسة الإدارة --------
-- جدولٌ لا عمودٌ على الإدارة: لإدارةٍ رئيسان في فترة تسليم، ولرئيسٍ إدارتان
-- بالإنابة. وكلاهما واقعٌ إداري لا استثناء.
create table if not exists department_head (
  tenant_id     uuid not null references tenant(id) on delete cascade,
  department_id uuid not null,
  user_id       uuid not null,
  assigned_at   timestamptz not null default now(),
  primary key (department_id, user_id)
);

alter table department_head drop constraint if exists department_head_dept_fk;
alter table department_head add constraint department_head_dept_fk
  foreign key (tenant_id, department_id) references department (tenant_id, id)
  on delete restrict;

alter table department_head drop constraint if exists department_head_user_fk;
alter table department_head add constraint department_head_user_fk
  foreign key (tenant_id, user_id) references app_user (tenant_id, id)
  on delete cascade;

create index if not exists department_head_by_user on department_head (tenant_id, user_id);

alter table department_head enable row level security;
alter table department_head force  row level security;
drop policy if exists tenant_isolation on department_head;
create policy tenant_isolation on department_head
  using (tenant_id = current_tenant()) with check (tenant_id = current_tenant());

-- ------------------------------------------------ شجرة الإدارة ونطاقها ----
-- رئيس الإدارة يرى فروعها أيضًا. والهيكل البلدي شجرة: «قطاع» فوق «إدارة»
-- فوق «قسم». ولو اقتصر النطاق على العقدة نفسها لرأى مديرُ القطاع صفرًا.
create or replace function department_subtree(p_root uuid)
returns setof uuid language sql stable as $$
  with recursive t as (
    select d.id from department d
     where d.tenant_id = current_tenant() and d.id = p_root
    union all
    select c.id from department c join t on c.parent_id = t.id
     where c.tenant_id = current_tenant()
  )
  select id from t
$$;

/** الإدارات التي يراها الفاعل الحالي بحكم رئاسته — هي وفروعها. */
create or replace function my_scope_departments()
returns setof uuid language sql stable as $$
  select distinct s
    from department_head h
    cross join lateral department_subtree(h.department_id) s
   where h.tenant_id = current_tenant() and h.user_id = current_actor()
$$;

-- ------------------------------------------------------- حَكَم الرؤية -----
-- المقارنة بالنصّ `role::text` لا بقيمة النوع عمدًا: القيم أعلاه أُضيفت في
-- هذه المعاملة نفسها، ونوعٌ أُضيفت قيمته للتوّ لا تُستعمل قيمته داخلها.
create or replace function actor_has_role(p_role text)
returns boolean language sql stable as $$
  select exists (
    select 1 from user_role_grant g
     where g.tenant_id = current_tenant()
       and g.user_id   = current_actor()
       and g.role::text = p_role)
$$;

/** هل يملك الفاعل الحالي رؤيةً على مستوى الجهة كلّها؟ */
create or replace function actor_is_tenant_wide()
returns boolean language sql stable as $$
  select actor_has_role('admin')
      or actor_has_role('academy_director')
      or actor_has_role('training_officer')
      or actor_has_role('auditor')
$$;

/**
 * الحَكَم. ترتيب الشروط مقصود: نفسه أولًا — فالموظف يرى نفسه ولو لم يُمنح
 * دورًا قطّ — ثم الرؤية العامة، ثم النطاق الإداري. ومن لا إدارة له لا يراه
 * رئيسٌ البتّة: لا يسقط في نطاق أحد بالصدفة.
 */
create or replace function can_view_user(p_target uuid)
returns boolean language sql stable as $$
  select case
    when current_actor() is null then false
    when p_target = current_actor() then true
    when actor_is_tenant_wide() then true
    else exists (
      select 1 from app_user u
       where u.tenant_id = current_tenant()
         and u.id = p_target
         and u.department_id is not null
         and u.department_id in (select my_scope_departments()))
  end
$$;

-- منظرٌ تقرأ منه الصفحات بدل أن تكرّر الشرط. `security_invoker` كي يبقى عزل
-- الجهات مفروضًا على القارئ لا على منشئ المنظر.
create or replace view visible_user with (security_invoker = true) as
select u.*
  from app_user u
 where u.tenant_id = current_tenant()
   and can_view_user(u.id);

-- ------------------------------------------------------------- الصلاحيات --
grant select, insert, update, delete on department_head to khuta_app;
grant select on visible_user to khuta_app;
grant execute on function department_subtree(uuid)  to khuta_app;
grant execute on function my_scope_departments()    to khuta_app;
grant execute on function actor_has_role(text)      to khuta_app;
grant execute on function actor_is_tenant_wide()    to khuta_app;
grant execute on function can_view_user(uuid)       to khuta_app;

commit;
