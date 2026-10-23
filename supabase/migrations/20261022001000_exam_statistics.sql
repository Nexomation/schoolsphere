-- Aggregate exam statistics for families. Parents and students may compare a
-- child's result with the class average, but must never see other students'
-- individual marks; RLS on `marks` blocks that, so this function returns only
-- aggregates, and only for published examinations (staff: any status).

create or replace function public.exam_class_statistics(p_exam uuid)
returns table (subject_id uuid, max_marks numeric, average numeric, appeared integer, class_average_percent numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_status text;
begin
  select ex.school_id, ex.status into v_school, v_status from public.examinations ex where ex.id = p_exam;
  if v_school is null or not (app.is_school_staff(v_school) or (v_status = 'published' and app.is_member(v_school))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    with per_student as (
      select m.student_id,
             sum(coalesce(m.marks_obtained, 0)) as obtained,
             sum(es.max_marks) as possible
      from public.marks m join public.examination_subjects es on es.id = m.examination_subject_id
      where es.examination_id = p_exam
      group by m.student_id
    ),
    overall as (
      select round(avg(100.0 * obtained / nullif(possible, 0)), 1) as pct from per_student
    )
    select es.subject_id, es.max_marks,
           round(avg(m.marks_obtained) filter (where not m.is_absent), 2),
           (count(m.id) filter (where not m.is_absent))::integer,
           (select pct from overall)
    from public.examination_subjects es
    left join public.marks m on m.examination_subject_id = es.id
    where es.examination_id = p_exam
    group by es.id, es.subject_id, es.max_marks;
end;
$$;

revoke all on function public.exam_class_statistics(uuid) from public, anon;
grant execute on function public.exam_class_statistics(uuid) to authenticated, service_role;
