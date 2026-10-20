#!/usr/bin/env python3
"""Turn the course content file into SQL. Nothing is retyped by hand."""
import json, sys, pathlib

SRC = pathlib.Path('/home/claude/platform/content/copilot_course.json')
d = json.loads(SRC.read_text(encoding='utf-8'))

def q(s):
    return "'" + str(s).replace("'", "''") + "'"

out = ["-- generated from copilot_course.json — do not edit by hand", "begin;"]

# ---- two tenants: the second exists only to prove isolation is real ----------
out.append(f"""
insert into tenant (slug, name_ar, name_en, demo_mode, demo_speed)
values ('alain', {q('بلدية مدينة العين')}, {q('Al Ain City Municipality')}, false, 1),
       ('bki',   {q('معهد ابن خلدون')},    {q('Bin Khaldoon Institute')},   false, 1)
on conflict (slug) do nothing;""")

c = d['course']
out.append(f"""
insert into course (tenant_id, code, title_ar, title_en, language, status)
select id, {q(c['code'])}, {q(c['title_ar'])}, {q(c['title_en'])}, {q(c['language'])}, 'published'
  from tenant where slug = 'alain'
on conflict (tenant_id, code) do nothing;""")

# ---- competencies -----------------------------------------------------------
vals = ",".join(f"({q(x['id'])},{q(x['ar'])})" for x in d['competencies'])
out.append(f"""
insert into competency (tenant_id, course_id, code, title_ar)
select co.tenant_id, co.id, v.code, v.t
  from course co, (values {vals}) as v(code, t)
 where co.code = {q(c['code'])}
on conflict (course_id, code) do nothing;""")

# ---- one media asset + two renditions (the transcode-on-upload model) -------
out.append(f"""
insert into media_asset (tenant_id, original_filename, bytes, duration_sec, state)
select tenant_id, {q(c['source_file'])}, {c['source_size_bytes']}, {c['duration_sec']}, 'ready'
  from course where code = {q(c['code'])};

insert into media_rendition (tenant_id, asset_id, label, width, height, bitrate_kbps, bytes, storage_key, state)
select a.tenant_id, a.id, v.label, v.w, v.h, v.br, v.bytes,
       'media/' || a.id || '/' || v.label || '.mp4', 'ready'
  from media_asset a,
       (values ('720p',1280,720,1400,272000000::bigint),
               ('480p',854,480,700,136000000::bigint)) as v(label,w,h,br,bytes)
 where a.original_filename = {q(c['source_file'])}
on conflict (asset_id, label) do nothing;""")

# ---- lessons ----------------------------------------------------------------
lv = ",".join(f"({l['no']},{q(l['title_ar'])},{l['start_sec']},{l['end_sec']})" for l in d['lessons'])
out.append(f"""
insert into lesson (tenant_id, course_id, no, title_ar, asset_id, start_sec, end_sec, required_watch_ratio)
select co.tenant_id, co.id, v.no, v.t, a.id, v.s, v.e, {d['rules']['R2_watch_ratio']}
  from course co
  join media_asset a on a.tenant_id = co.tenant_id and a.original_filename = {q(c['source_file'])},
       (values {lv}) as v(no, t, s, e)
 where co.code = {q(c['code'])}
on conflict (course_id, no) do nothing;""")

R = d['rules']
# ---- assessments ------------------------------------------------------------
out.append(f"""
insert into assessment (tenant_id, course_id, kind, lesson_id, pass_mark, max_attempts)
select co.tenant_id, co.id, 'pre', null, null, 1 from course co where co.code = {q(c['code'])};

insert into assessment (tenant_id, course_id, kind, lesson_id, pass_mark, max_attempts)
select co.tenant_id, co.id, 'post', null, {R['R7_certificate_pass_mark']}, {R['R6_attempts']['post']}
  from course co where co.code = {q(c['code'])};

insert into assessment (tenant_id, course_id, kind, lesson_id, pass_mark, max_attempts)
select l.tenant_id, l.course_id, 'lesson', l.id, {R['R4_lesson_quiz_pass_mark']}, {R['R6_attempts']['lesson_quiz']}
  from lesson l join course co on co.id = l.course_id
 where co.code = {q(c['code'])};""")

# ---- questions and options --------------------------------------------------
def emit_questions(items, kind, lesson_no=None):
    where = (f"a.kind = 'lesson' and l.no = {lesson_no}" if kind == 'lesson'
             else f"a.kind = '{kind}'")
    join = "join lesson l on l.id = a.lesson_id " if kind == 'lesson' else ""
    for pos, it in enumerate(items, 1):
        out.append(f"""
insert into question (tenant_id, assessment_id, competency_id, external_id, stem_ar, position)
select a.tenant_id, a.id, cp.id, {q(it['id'])}, {q(it['stem_ar'])}, {pos}
  from assessment a {join}
  join course co on co.id = a.course_id
  join competency cp on cp.course_id = co.id and cp.code = {q(it['competency'])}
 where co.code = {q(c['code'])} and {where}
on conflict (assessment_id, external_id) do nothing;""")
        ov = ",".join(
            f"({i+1},{q(['أ','ب','ج','د'][i])},{q(o)},{'true' if i == it['answer'] else 'false'})"
            for i, o in enumerate(it['options_ar']))
        out.append(f"""
insert into question_option (tenant_id, question_id, position, label, text_ar, is_correct)
select qu.tenant_id, qu.id, v.p, v.lb, v.tx, v.ok
  from question qu
 cross join lateral (values {ov}) as v(p, lb, tx, ok)
 where qu.external_id = {q(it['id'])}
on conflict (question_id, position) do nothing;""")

emit_questions(d['assessments']['pre']['questions'], 'pre')
for no in sorted(d['assessments']['lesson_quizzes'], key=int):
    emit_questions(d['assessments']['lesson_quizzes'][no], 'lesson', int(no))
emit_questions(d['assessments']['post']['questions'], 'post')

# ---- R8 parallel links ------------------------------------------------------
for it in d['assessments']['post']['questions']:
    if it.get('parallel_of'):
        out.append(f"""
update question set parallel_of = (select id from question where external_id = {q(it['parallel_of'])})
 where external_id = {q(it['id'])};""")

out.append("commit;")
print("\n".join(out))
