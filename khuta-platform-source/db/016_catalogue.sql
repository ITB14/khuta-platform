-- ============================================================================
--  بنية الكتالوج — التصنيف والمزوّد.
--
--  هذه هي الوحدة التي أُجّلت عمدًا، والحجّة التي أُجّلت بها صحيحة ولا تُنكر:
--  على دورة واحدة لا يفرز التصنيف شيئًا ولا يميّز المزوّد بين اثنين. فهي
--  تُبنى اليوم بنيةً لا واجهةَ تصفّح: جدولان وحقلان ومكانٌ للإسناد — وتصير
--  ذاتَ أثرٍ ظاهرٍ يوم تنزل الدورة الثانية، لا قبلها.
--
--  وما يجعلها تستحقّ البناء الآن أنّ إضافتها بعد امتلاء الكتالوج أغلى: دورةٌ
--  صُوِّرت ونُشرت وسُجّل فيها ألفٌ ثم صُنِّفت لاحقًا تُصنَّف بالتخمين، أمّا
--  الحقل القائم من أوّل يوم فيُملأ عند الإنشاء وهو معروف.
--
--  والقيمتان مُعرَّفتان لا نصًّا حرًّا، للسبب الذي عُرِّفت به الإدارات
--  والمهارات: «مايكروسوفت» و«Microsoft» و«مايكروسوفت ٣٦٥» ثلاثةُ مزوّدين في
--  كل تقرير، وهي في الحقيقة واحد.
--
--  ولا قيمة تُزرع هنا: أوّلُ تصنيفٍ وأوّلُ مزوّدٍ قرارُ محتوى تملكه الجهة،
--  كما كان كتالوج المهارات. الجدول يُفتح فارغًا ويُملأ من لوحة المسؤول.
-- ============================================================================
begin;

create table if not exists course_category (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  name_ar     text not null check (btrim(name_ar) <> ''),
  name_en     text,
  sort        int  not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, name_ar),
  unique (tenant_id, id)
);

-- المزوّد: من أنتج المحتوى، لا من يمنح الشهادة. الشهادة تحملها الجهة دائمًا
-- وهذا لا يتغيّر بتغيّر المزوّد — ولذلك هو حقلٌ على الدورة لا على الشهادة.
create table if not exists provider (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  name_ar     text not null check (btrim(name_ar) <> ''),
  name_en     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, name_ar),
  unique (tenant_id, id)
);

alter table course add column if not exists category_id uuid;
alter table course add column if not exists provider_id uuid;

-- مفاتيح مركّبة: تصنيفُ جهةٍ لا يُسنَد إلى دورة جهةٍ أخرى.
alter table course drop constraint if exists course_category_fk;
alter table course add constraint course_category_fk
  foreign key (tenant_id, category_id) references course_category (tenant_id, id)
  on delete restrict;

alter table course drop constraint if exists course_provider_fk;
alter table course add constraint course_provider_fk
  foreign key (tenant_id, provider_id) references provider (tenant_id, id)
  on delete restrict;

create index if not exists course_by_category on course (tenant_id, category_id);
create index if not exists course_by_provider on course (tenant_id, provider_id);

alter table course_category enable row level security;
alter table course_category force row level security;
drop policy if exists tenant_isolation on course_category;
create policy tenant_isolation on course_category
  using (tenant_id = current_tenant()) with check (tenant_id = current_tenant());

alter table provider enable row level security;
alter table provider force row level security;
drop policy if exists tenant_isolation on provider;
create policy tenant_isolation on provider
  using (tenant_id = current_tenant()) with check (tenant_id = current_tenant());

grant select, insert, update, delete on course_category to khuta_app;
grant select, insert, update, delete on provider        to khuta_app;

-- ------------------------------------------------------- الكتالوج قراءةً --
-- منظرٌ واحد تقرأ منه صفحة الكتالوج، فلا يُعاد الربط في كل صفحة. والعدّ
-- للتسجيلات لأنه ما يُسأل عنه فعلًا: كم موظفًا في كل عائلة من الدورات.
drop view if exists course_catalogue;
create view course_catalogue as
select co.tenant_id,
       co.id        as course_id,
       co.code,
       co.title_ar,
       co.status,
       co.mode,
       cc.id        as category_id,
       cc.name_ar   as category_ar,
       pr.id        as provider_id,
       pr.name_ar   as provider_ar,
       (select count(*) from lesson l where l.course_id = co.id)::int   as lessons,
       (select count(*) from enrolment e where e.course_id = co.id)::int as enrolments
  from course co
  left join course_category cc on cc.id = co.category_id
  left join provider        pr on pr.id = co.provider_id;

-- المنظر يرث أمن صفوف من يقرأ، لا من أنشأه.
alter view course_catalogue set (security_invoker = true);
grant select on course_catalogue to khuta_app;

commit;
