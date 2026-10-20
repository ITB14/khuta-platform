-- حدود الدروس في 002 كانت تقديرية، وُضعت قبل أن يوجد نصّ الفيديو. بمقابلتها
-- بالتفريغ العربي (content/transcript.srt) تبيّن أنها تخطئ في أربعة مواضع:
--
--   • 1037 (الدرس ٥/٦): محتوى Excel ينتهي عند 972.6ث ويبدأ قسم PowerPoint عند
--     973.1ث. الحدّ المخزَّن متأخّر ٦٤ ثانية، فيضع أوّل دقيقة من PowerPoint في
--     ذيل درس Excel. هذا أثقل الأخطاء.
--   • 815 (الدرس ٤/٥): يقطع جملة «والآن ننتقل إلى Excel، فهو من | أكثر
--     التطبيقات أهمية»، فيبدأ الدرس الخامس بشطر جملة.
--   • 1240 (الدرس ٦/٧): يقطع «ثم يراجع الموظف الخطة ويعدلها وفق الموارد |
--     والأولويات»، ويبتر خاتمة قسم Teams.
--   • 1520 (الدرس ٧/٨): يقطع «داخل المؤسسات الحكومية | يجب أن يكون مرتبطًا».
--
-- و312 أُزيح إلى 311 ليبدأ الدرس الثالث بجملة «لننتقل إلى...» كاملة بدل أن
-- تتدلّى في ذيل الدرس الثاني. وبقي 165 و550 كما هما — فحصهما أظهر أنهما أفضل
-- قطع ممكن عند الانتقال.
--
-- لم يُرمَّز أي مقطع بالأرقام القديمة بعد، فالتصحيح هنا لا يُبطل عملًا قائمًا.
-- duration_sec في media_asset مشتقّ من الحدود في 006، فيُحدَّث معها.
do $$
declare v record;
begin
  perform set_config('khuta.tenant_id',
                     (select id::text from tenant where slug = 'alain'), false);

  for v in select * from (values
             (1::smallint,    0,  165),
             (2::smallint,  165,  311),
             (3::smallint,  311,  550),
             (4::smallint,  550,  812),
             (5::smallint,  812,  973),
             (6::smallint,  973, 1255),
             (7::smallint, 1255, 1514),
             (8::smallint, 1514, 1662)
           ) as t(no, s, e)
  loop
    update lesson
       set start_sec = v.s,
           end_sec   = v.e
     where lesson.no = v.no;

    update media_asset a
       set duration_sec      = v.e - v.s,
           original_filename = format('copilot final 1.mp4 [%s-%s]', v.s, v.e)
      from lesson l
     where l.no = v.no
       and a.id = l.asset_id;
  end loop;
end $$;

-- الحدود متّصلة ولا تتداخل، ومجموعها طول التسجيل الفعلي.
do $$
declare gap int;
begin
  select count(*) into gap
    from lesson a join lesson b on b.no = a.no + 1
   where a.end_sec <> b.start_sec;
  if gap > 0 then
    raise exception 'الحدود غير متّصلة: % فجوة', gap;
  end if;
  if (select max(end_sec) from lesson) <> 1662 then
    raise exception 'آخر حدّ لا يساوي طول التسجيل 1662ث';
  end if;
end $$;
