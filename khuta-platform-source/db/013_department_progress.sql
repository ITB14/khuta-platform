-- ============================================================================
--  تقدّم الجهة بحسب الإدارة.
--
--  لوحة المتعلّمين قائمةُ أسماء. تكفي عشرة، ولا تكفي ألفًا وسبعمئة: من يسأل
--  عن حال البلدية لا يقرأ ألفًا وسبعمئة سطر، يسأل أيّ إدارة تأخّرت.
--
--  والحساب هنا لا في الصفحة: التقرير الذي يُرفَع إلى الدائرة يجب أن يُعاد
--  إنتاجه من قاعدة البيانات بالسؤال نفسه، لا من شيفرة صفحة قد تتغيّر.
-- ============================================================================
begin;

create or replace view department_progress with (security_invoker = true) as
with per_enrolment as (
  select e.tenant_id,
         u.department_id,
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
select tenant_id,
       department_id,
       count(*)::int                                                as enrolments,
       -- الموقوف يبقى في المقام: إخراجه يرفع النسبة بلا أن يتعلّم أحد، فيُعدّ
       -- ويُذكر عدده كي يبقى الرقم مفهومًا لمن يسأل عنه.
       count(*) filter (where status = 'suspended')::int             as suspended,
       count(*) filter (where done > 0)::int                         as started,
       count(*) filter (where lessons > 0 and done >= lessons)::int  as watched,
       count(*) filter (where certified)::int                        as certified,
       count(*) filter (where not certified and due_at is not null
                          and due_at < now())::int                   as overdue,
       count(*) filter (where pre_score is not null
                          and post_score is not null)::int           as measured,
       round(avg(post_score - pre_score)
             filter (where pre_score is not null and post_score is not null) * 100)::int
                                                                     as avg_gain
  from per_enrolment
 group by tenant_id, department_id;

comment on view department_progress is
  'صفّ لكل إدارة، وصفّ بإدارة فارغة لمن لا إدارة له. المقام يشمل الموقوفين وعددهم مذكور.';

grant select on department_progress to khuta_app;

commit;
