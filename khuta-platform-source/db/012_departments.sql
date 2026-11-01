-- ============================================================================
--  الإدارات — من نصّ حرّ إلى كيان.
--
--  كانت إدارة الموظف حقلًا نصّيًا يُكتب باليد، ونتيجته ظاهرة في البيانات
--  القائمة: «الصحة العامة» و«الصحة العامة والبيئة» صفّان مختلفان في كل تقرير،
--  وقد يكونان إدارة واحدة. ومع ألف وسبعمئة موظف لا يُبنى تقرير على حقل كهذا.
--
--  الجدول هنا يمنع التكرار عند الكتابة لا عند التقرير: اسم الإدارة فريد داخل
--  الجهة. ولا يدمج هذا الترحيلُ اسمين متشابهين من تلقاء نفسه — التشابه ظنّ،
--  والدمج قرار إداري يُتّخذ من الشاشة.
-- ============================================================================
begin;

create table if not exists department (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  parent_id   uuid,
  code        text,
  name_ar     text not null check (btrim(name_ar) <> ''),
  name_en     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, name_ar),
  unique (tenant_id, id)                       -- مرجع المفاتيح المركّبة أدناه
);

-- الأب من الجهة نفسها. مفتاح مركّب لا مفتاح على المعرّف وحده، وإلّا أمكن
-- ربط إدارة بأبٍ في جهة أخرى والعزل قائم فلا يراه أحد.
alter table department drop constraint if exists department_parent_fk;
alter table department add constraint department_parent_fk
  foreign key (tenant_id, parent_id) references department (tenant_id, id)
  on delete restrict;

create index if not exists department_parent_ix on department (tenant_id, parent_id);

-- التسلسل شجرة لا حلقة. المفتاح وحده لا يمنع أن تصير إدارةٌ جَدَّ نفسها.
create or replace function department_no_cycle() returns trigger
language plpgsql as $$
declare v_id uuid; v_depth int := 0;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then
    raise exception 'الإدارة لا تكون أبًا لنفسها' using errcode = 'check_violation';
  end if;
  v_id := new.parent_id;
  while v_id is not null loop
    v_depth := v_depth + 1;
    if v_depth > 32 then
      raise exception 'تسلسل الإدارات أعمق ممّا يُعقل' using errcode = 'check_violation';
    end if;
    select parent_id into v_id from department where id = v_id;
    if v_id = new.id then
      raise exception 'حلقة في تسلسل الإدارات' using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists department_no_cycle_t on department;
create trigger department_no_cycle_t before insert or update of parent_id on department
  for each row execute function department_no_cycle();

-- ------------------------------------------------- ربط الموظف بالإدارة ----
alter table app_user add column if not exists department_id uuid;

alter table app_user drop constraint if exists app_user_department_fk;
-- restrict لا set null: الحقل tenant_id في الطرف الآخر NOT NULL فلا يُفرَّغ
-- معه، والأهمّ أن حذف إدارة يحمل موظفين ليس تنظيفًا بل فقدُ نسبةٍ من السجلّ.
-- الإدارة تُعطَّل ولا تُحذف.
alter table app_user add constraint app_user_department_fk
  foreign key (tenant_id, department_id) references department (tenant_id, id)
  on delete restrict;

create index if not exists app_user_department_ix on app_user (tenant_id, department_id);

-- ------------------------------------------------------------ النقل -------
-- كل قيمة نصّية قائمة تصير إدارة باسمها كما كُتب. لا تخمين ولا دمج.
insert into department (tenant_id, name_ar)
select distinct u.tenant_id, btrim(u.department)
  from app_user u
 where u.department is not null and btrim(u.department) <> ''
on conflict (tenant_id, name_ar) do nothing;

update app_user u set department_id = d.id
  from department d
 where d.tenant_id = u.tenant_id and d.name_ar = btrim(u.department)
   and u.department_id is null;

-- ------------------------------------------------- اسم إلى إدارة ---------
-- الاستيراد من ملف يأتي بأسماء لا بمعرّفات. هذه تُطابق الاسم ولا تُنشئ:
-- إنشاء إدارة من خليّة في ملف هو الطريق إلى أربعين نسخة من إدارة واحدة.
create or replace function department_by_name(p_name text)
returns uuid language sql stable as $$
  select d.id from department d
   where d.tenant_id = current_tenant() and d.name_ar = btrim(p_name) and d.is_active
   limit 1
$$;

-- ------------------------------------------- النصّ يتبع المعرّف لا يسبقه --
-- العمود النصّي باقٍ كي لا تنكسر التقارير والتصدير القائمة، لكنه صار مرآةً:
-- يُكتب من الجدول عند كل تغيير، فلا يفترق الاثنان ولا يصير للحقيقة مصدران.
create or replace function app_user_department_mirror() returns trigger
language plpgsql as $$
declare v_name text; v_wrote_text boolean;
begin
  -- من كتب النصّ وحده قصد النصّ. ولا يكفي أن يكون النصّ فارغًا كي يُفرَّغ
  -- الانتماء: الحقل قد يكون فارغًا لأن أحدًا لم يمسّه. فالفارق بين «كُتب
  -- فارغًا» و«لم يُكتب» هو ما يُقرَّر عليه، لا قيمتُه وحدها.
  v_wrote_text := tg_op = 'INSERT'
                  or (new.department is distinct from old.department
                      and new.department_id is not distinct from old.department_id);

  if v_wrote_text then
    if new.department is null or btrim(new.department) = '' then
      new.department_id := null;                       -- فُصل عن إدارته عمدًا
    else
      -- يُترجَم الاسم هنا مرّة واحدة بدل أن يُترجَم في كل مُنادٍ — أو يُرفض
      -- باسمه. والرفض صريح: الصمت هنا يعني موظفًا يظنّ المسؤول أنه أُسند
      -- إلى إدارة وهو خارجها في كل تقرير.
      new.department_id := department_by_name(new.department);
      if new.department_id is null then
        raise exception 'لا توجد إدارة باسم «%» في هذه الجهة', btrim(new.department)
          using errcode = 'foreign_key_violation';
      end if;
    end if;
  end if;

  -- ثم النصّ يُشتقّ من الجدول دائمًا، فلا يفترق الاثنان أبدًا.
  if new.department_id is not null then
    select d.name_ar into v_name from department d where d.id = new.department_id;
    new.department := v_name;
  else
    new.department := null;
  end if;
  return new;
end $$;

drop trigger if exists app_user_department_mirror_t on app_user;
create trigger app_user_department_mirror_t before insert or update on app_user
  for each row execute function app_user_department_mirror();

comment on column app_user.department is
  'مرآة لاسم الإدارة تُكتب من department_id. لا تُكتب مباشرةً — المصدر هو الجدول.';

-- --------------------------------------------------------- أمن الصفوف ----
alter table department enable row level security;
alter table department force row level security;
drop policy if exists tenant_isolation on department;
create policy tenant_isolation on department
  using (tenant_id = current_tenant()) with check (tenant_id = current_tenant());

grant select, insert, update, delete on department to khuta_app;
grant execute on function department_by_name(text) to khuta_app;

-- فحص: لم تُفقد إدارة في النقل.
do $$
declare v_orphan int;
begin
  select count(*) into v_orphan from app_user
   where department is not null and btrim(department) <> '' and department_id is null;
  if v_orphan > 0 then
    raise exception 'بقي % موظفًا بإدارة نصّية بلا صفّ في الجدول', v_orphan;
  end if;
end $$;

commit;
