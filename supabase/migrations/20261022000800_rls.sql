-- Row Level Security for every table.
--
-- The web server runs each user request inside a transaction that executes
--   select set_config('request.jwt.claims', '{"sub": "<user id>", "role": "authenticated"}', true);
--   set local role authenticated;
-- so these policies apply to all application reads and writes, exactly as they
-- do for Supabase PostgREST clients. Helper functions are SECURITY DEFINER so
-- they can read membership tables without recursive policy evaluation.
--
-- Role summary (see also src/lib/auth/permissions.ts):
--   school_admin           everything inside their school
--   accountant             fees and payments, read-only student directory
--   teacher                sections/subjects they are assigned to
--   parent                 verified links to their own children only
--   student                their own records only
--   transport_coordinator  transport data and students with transport
--   driver                 trips on routes assigned to them; student details
--                          only through get_trip_manifest()
--   platform admin         tenant management; no blanket access to children's records

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function app.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

create or replace function app.has_role(p_school uuid, variadic p_roles public.school_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.school_memberships m
    join public.schools s on s.id = m.school_id
    where m.school_id = p_school
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any (p_roles)
      and s.status <> 'suspended'
  )
$$;

create or replace function app.is_member(p_school uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.school_memberships m
    join public.schools s on s.id = m.school_id
    where m.school_id = p_school and m.user_id = auth.uid() and m.status = 'active' and s.status <> 'suspended'
  )
$$;

create or replace function app.is_school_staff(p_school uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.has_role(p_school, 'school_admin', 'accountant', 'teacher', 'transport_coordinator', 'driver')
$$;

-- Teacher of the section: class teacher, or any subject assignment in it.
create or replace function app.teaches_section(p_section uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.sections sec
    join public.staff st on st.school_id = sec.school_id and st.user_id = auth.uid() and st.status = 'active'
    where sec.id = p_section
      and app.has_role(sec.school_id, 'teacher')
      and (
        sec.class_teacher_id = st.id
        or exists (select 1 from public.teacher_assignments ta where ta.section_id = sec.id and ta.staff_id = st.id)
      )
  )
$$;

-- May this teacher work with this subject in this section? Class teachers and
-- section-wide assignments (subject_id null) cover every subject.
create or replace function app.teaches_section_subject(p_section uuid, p_subject uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.sections sec
    join public.staff st on st.school_id = sec.school_id and st.user_id = auth.uid() and st.status = 'active'
    where sec.id = p_section
      and app.has_role(sec.school_id, 'teacher')
      and (
        sec.class_teacher_id = st.id
        or exists (
          select 1 from public.teacher_assignments ta
          where ta.section_id = sec.id and ta.staff_id = st.id
            and (ta.subject_id is null or ta.subject_id = p_subject)
        )
      )
  )
$$;

create or replace function app.teaches_student(p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrollments e
    where e.student_id = p_student and e.status = 'active' and app.teaches_section(e.section_id)
  )
$$;

create or replace function app.is_student_self(p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student and s.user_id = auth.uid() and app.has_role(s.school_id, 'student')
  )
$$;

-- Parent with a VERIFIED link, or the student themself.
create or replace function app.is_family_of(p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_student_self(p_student) or exists (
    select 1
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = p_student
      and sg.verified_at is not null
      and g.user_id = auth.uid()
      and app.has_role(g.school_id, 'parent')
  )
$$;

create or replace function app.family_in_section(p_section uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrollments e
    where e.section_id = p_section and e.status = 'active' and app.is_family_of(e.student_id)
  )
$$;

create or replace function app.route_has_my_child(p_route uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.student_transport_assignments sta
    where sta.route_id = p_route and sta.end_date is null and app.is_family_of(sta.student_id)
  )
$$;

create or replace function app.drives_route(p_route uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.transport_routes r
    join public.drivers d on d.id = r.driver_id and d.status = 'active'
    join public.staff st on st.id = d.staff_id and st.user_id = auth.uid()
    where r.id = p_route and app.has_role(r.school_id, 'driver')
  )
$$;

create or replace function app.manages_transport(p_school uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.has_role(p_school, 'school_admin', 'transport_coordinator')
$$;

create or replace function app.can_view_student(p_school uuid, p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.has_role(p_school, 'school_admin', 'accountant')
    or app.is_family_of(p_student)
    or app.teaches_student(p_student)
    or (
      app.has_role(p_school, 'transport_coordinator')
      and exists (select 1 from public.student_transport_assignments sta where sta.student_id = p_student and sta.end_date is null)
    )
$$;

create or replace function app.can_view_staff(p_school uuid, p_staff uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_school_staff(p_school)
    or exists (
      select 1 from public.sections sec
      where sec.class_teacher_id = p_staff and app.family_in_section(sec.id)
    )
    or exists (
      select 1 from public.teacher_assignments ta
      where ta.staff_id = p_staff and app.family_in_section(ta.section_id)
    )
    or exists (
      select 1 from public.transport_routes r
      join public.drivers d on d.id = r.driver_id
      where (d.staff_id = p_staff or r.attendant_staff_id = p_staff) and app.route_has_my_child(r.id)
    )
$$;

create or replace function app.is_own_guardian(p_guardian uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.guardians g where g.id = p_guardian and g.user_id = auth.uid())
$$;

create or replace function app.teaches_child_of_guardian(p_guardian uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.student_guardians sg
    where sg.guardian_id = p_guardian and app.teaches_student(sg.student_id)
  )
$$;

-- Staff can see the profiles (names) of people in schools where they work.
create or replace function app.shares_school_as_staff(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.school_memberships m
    where m.user_id = p_user and m.status = 'active' and app.is_school_staff(m.school_id)
  )
$$;

create or replace function app.can_view_assignment(p_assignment uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments a
    where a.id = p_assignment
      and (
        app.has_role(a.school_id, 'school_admin')
        or app.teaches_section(a.section_id)
        or (a.status <> 'draft' and app.family_in_section(a.section_id))
      )
  )
$$;

create or replace function app.can_grade_assignment(p_assignment uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments a
    where a.id = p_assignment
      and (app.has_role(a.school_id, 'school_admin') or app.teaches_section_subject(a.section_id, a.subject_id))
  )
$$;

-- Marks entry: subject teachers of the student's section while the exam is not
-- published; school admins at any time (corrections are audited).
create or replace function app.can_enter_marks(p_exam_subject uuid, p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.examination_subjects es
    join public.examinations ex on ex.id = es.examination_id
    where es.id = p_exam_subject
      and (
        app.has_role(ex.school_id, 'school_admin')
        or (
          ex.status in ('scheduled', 'marks_entry')
          and exists (
            select 1 from public.enrollments e
            join public.sections sec on sec.id = e.section_id
            where e.student_id = p_student and e.status = 'active'
              and sec.class_id = ex.class_id and sec.academic_year_id = ex.academic_year_id
              and app.teaches_section_subject(e.section_id, es.subject_id)
          )
        )
      )
  )
$$;

create or replace function app.can_view_marks(p_exam_subject uuid, p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.examination_subjects es
    join public.examinations ex on ex.id = es.examination_id
    where es.id = p_exam_subject
      and (
        app.has_role(ex.school_id, 'school_admin')
        or (app.teaches_student(p_student) and app.has_role(ex.school_id, 'teacher'))
        or (ex.status = 'published' and app.is_family_of(p_student))
      )
  )
$$;

create or replace function app.coordinates_activity(p_activity uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.extracurricular_activities a
    join public.staff st on st.id = a.coordinator_staff_id and st.user_id = auth.uid()
    where a.id = p_activity and app.is_school_staff(a.school_id)
  )
$$;

grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Table privileges. anon gets nothing; authenticated is constrained by RLS.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke update, delete, truncate on public.audit_logs from authenticated;
revoke insert, update, delete on public.payment_webhook_events from authenticated;
revoke all on public.receipt_counters from authenticated;
revoke insert, update, delete on public.notification_deliveries from authenticated;
revoke insert on public.notifications from authenticated;
revoke all on public.demo_requests from authenticated;
revoke all on public.platform_admins from authenticated;
grant select on public.platform_admins to authenticated;
grant select, update on public.demo_requests to authenticated;

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Tenancy and identity
-- ---------------------------------------------------------------------------
create policy schools_select on public.schools for select to authenticated
  using (app.is_member(id) or app.is_platform_admin());
create policy schools_update on public.schools for update to authenticated
  using (app.has_role(id, 'school_admin') or app.is_platform_admin())
  with check (app.has_role(id, 'school_admin') or app.is_platform_admin());
create policy schools_insert on public.schools for insert to authenticated
  with check (app.is_platform_admin());

create policy user_profiles_select on public.user_profiles for select to authenticated
  using (
    id = (select auth.uid())
    or app.is_platform_admin()
    or app.shares_school_as_staff(id)
  );
create policy user_profiles_insert on public.user_profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy user_profiles_update on public.user_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

create policy memberships_select on public.school_memberships for select to authenticated
  using (user_id = (select auth.uid()) or app.has_role(school_id, 'school_admin') or app.is_platform_admin());
create policy memberships_write on public.school_memberships for all to authenticated
  using (app.has_role(school_id, 'school_admin'))
  with check (app.has_role(school_id, 'school_admin'));

create policy invitations_admin on public.invitations for all to authenticated
  using (app.has_role(school_id, 'school_admin') or app.is_platform_admin())
  with check (app.has_role(school_id, 'school_admin') or app.is_platform_admin());

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (app.has_role(school_id, 'school_admin') or app.is_platform_admin());

create policy demo_requests_platform on public.demo_requests for select to authenticated
  using (app.is_platform_admin());
create policy demo_requests_platform_update on public.demo_requests for update to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Academic structure: readable by members, writable by school admins
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['academic_years', 'terms', 'classes', 'subjects', 'sections', 'teacher_assignments',
                           'timetable_entries', 'calendar_events', 'grade_scales', 'examination_subjects']
  loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated using (app.is_member(school_id))', t);
    execute format(
      'create policy %1$s_write on public.%1$I for all to authenticated
         using (app.has_role(school_id, ''school_admin''))
         with check (app.has_role(school_id, ''school_admin''))', t);
  end loop;
end
$$;

create policy staff_select on public.staff for select to authenticated
  using (app.can_view_staff(school_id, id));
create policy staff_write on public.staff for all to authenticated
  using (app.has_role(school_id, 'school_admin'))
  with check (app.has_role(school_id, 'school_admin'));

create policy students_select on public.students for select to authenticated
  using (app.can_view_student(school_id, id));
create policy students_write on public.students for all to authenticated
  using (app.has_role(school_id, 'school_admin'))
  with check (app.has_role(school_id, 'school_admin'));

create policy guardians_select on public.guardians for select to authenticated
  using (
    app.has_role(school_id, 'school_admin', 'accountant')
    or user_id = (select auth.uid())
    or app.teaches_child_of_guardian(id)
  );
create policy guardians_write on public.guardians for all to authenticated
  using (app.has_role(school_id, 'school_admin'))
  with check (app.has_role(school_id, 'school_admin'));

create policy student_guardians_select on public.student_guardians for select to authenticated
  using (
    app.has_role(school_id, 'school_admin', 'accountant')
    or app.teaches_student(student_id)
    or app.is_own_guardian(guardian_id)
  );
create policy student_guardians_write on public.student_guardians for all to authenticated
  using (app.has_role(school_id, 'school_admin'))
  with check (app.has_role(school_id, 'school_admin'));

create policy enrollments_select on public.enrollments for select to authenticated
  using (app.can_view_student(school_id, student_id));
create policy enrollments_write on public.enrollments for all to authenticated
  using (app.has_role(school_id, 'school_admin'))
  with check (app.has_role(school_id, 'school_admin'));

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------
create policy attendance_select on public.attendance_records for select to authenticated
  using (app.has_role(school_id, 'school_admin') or app.teaches_section(section_id) or app.is_family_of(student_id));
create policy attendance_insert on public.attendance_records for insert to authenticated
  with check (
    (app.has_role(school_id, 'school_admin') or app.teaches_section(section_id))
    and marked_by = (select auth.uid())
    and exists (
      select 1 from public.enrollments e
      where e.student_id = attendance_records.student_id and e.section_id = attendance_records.section_id and e.status = 'active'
    )
  );
create policy attendance_update on public.attendance_records for update to authenticated
  using (app.has_role(school_id, 'school_admin') or app.teaches_section(section_id))
  with check (
    (app.has_role(school_id, 'school_admin') or app.teaches_section(section_id))
    and marked_by = (select auth.uid())
  );
create policy attendance_delete on public.attendance_records for delete to authenticated
  using (app.has_role(school_id, 'school_admin'));

-- ---------------------------------------------------------------------------
-- Homework
-- ---------------------------------------------------------------------------
create policy assignments_select on public.assignments for select to authenticated
  using (app.can_view_assignment(id));
create policy assignments_write on public.assignments for all to authenticated
  using (app.has_role(school_id, 'school_admin') or app.teaches_section_subject(section_id, subject_id))
  with check (app.has_role(school_id, 'school_admin') or app.teaches_section_subject(section_id, subject_id));

create policy assignment_extensions_select on public.assignment_extensions for select to authenticated
  using (app.can_grade_assignment(assignment_id) or app.is_family_of(student_id));
create policy assignment_extensions_write on public.assignment_extensions for all to authenticated
  using (app.can_grade_assignment(assignment_id))
  with check (app.can_grade_assignment(assignment_id));

create policy submissions_select on public.assignment_submissions for select to authenticated
  using (app.can_grade_assignment(assignment_id) or app.teaches_student(student_id) or app.is_family_of(student_id));
create policy submissions_insert on public.assignment_submissions for insert to authenticated
  with check (
    app.is_student_self(student_id)
    and exists (
      select 1 from public.assignments a
      join public.enrollments e on e.section_id = a.section_id and e.student_id = assignment_submissions.student_id and e.status = 'active'
      where a.id = assignment_id and a.status = 'published'
    )
  );
create policy submissions_update on public.assignment_submissions for update to authenticated
  using (app.is_student_self(student_id) or app.can_grade_assignment(assignment_id))
  with check (app.is_student_self(student_id) or app.can_grade_assignment(assignment_id));

-- Students may only touch their answer; graders may only touch grading fields.
create or replace function app.guard_submission_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due timestamptz;
  v_allow_late boolean;
  v_ext timestamptz;
begin
  if auth.uid() is null then
    return new; -- trusted server/service context
  end if;

  if app.is_student_self(new.student_id) and not app.can_grade_assignment(new.assignment_id) then
    if tg_op = 'UPDATE' then
      if old.status = 'graded' then
        raise exception 'This submission has already been reviewed' using errcode = '42501';
      end if;
    end if;
    select a.due_at, a.allow_late_submission into v_due, v_allow_late
      from public.assignments a where a.id = new.assignment_id;
    select x.extended_due_at into v_ext
      from public.assignment_extensions x where x.assignment_id = new.assignment_id and x.student_id = new.student_id;
    new.submitted_at := now();
    new.is_late := now() > coalesce(v_ext, v_due);
    if new.is_late and not v_allow_late then
      raise exception 'The deadline for this assignment has passed' using errcode = '42501';
    end if;
    new.status := 'submitted';
    new.marks_awarded := null;
    new.feedback := null;
    new.graded_by := null;
    new.graded_at := null;
    return new;
  end if;

  if tg_op = 'UPDATE' and app.can_grade_assignment(new.assignment_id) then
    if new.content is distinct from old.content or new.submitted_at is distinct from old.submitted_at
       or new.student_id is distinct from old.student_id or new.is_late is distinct from old.is_late then
      raise exception 'Graders cannot change a student''s submission' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Not allowed to modify this submission' using errcode = '42501';
end;
$$;
create trigger assignment_submissions_guard before insert or update on public.assignment_submissions
  for each row execute function app.guard_submission_write();

create policy file_objects_select on public.file_objects for select to authenticated
  using (
    case entity_type
      when 'assignment' then app.can_view_assignment(entity_id)
      when 'submission' then exists (
        select 1 from public.assignment_submissions s
        where s.id = entity_id
          and (app.can_grade_assignment(s.assignment_id) or app.is_family_of(s.student_id))
      )
      when 'achievement' then exists (
        select 1 from public.student_achievements sa
        where sa.id = entity_id
          and (app.has_role(sa.school_id, 'school_admin') or app.teaches_student(sa.student_id) or app.is_family_of(sa.student_id))
      )
      else false
    end
  );
create policy file_objects_insert on public.file_objects for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and app.is_member(school_id));
create policy file_objects_delete on public.file_objects for delete to authenticated
  using (uploaded_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Examinations
-- ---------------------------------------------------------------------------
create policy examinations_select on public.examinations for select to authenticated
  using (app.is_school_staff(school_id) or (status <> 'draft' and app.is_member(school_id)));
create policy examinations_write on public.examinations for all to authenticated
  using (app.has_role(school_id, 'school_admin'))
  with check (app.has_role(school_id, 'school_admin'));

create policy marks_select on public.marks for select to authenticated
  using (app.can_view_marks(examination_subject_id, student_id));
create policy marks_insert on public.marks for insert to authenticated
  with check (app.can_enter_marks(examination_subject_id, student_id) and entered_by = (select auth.uid()));
create policy marks_update on public.marks for update to authenticated
  using (app.can_enter_marks(examination_subject_id, student_id))
  with check (app.can_enter_marks(examination_subject_id, student_id) and entered_by = (select auth.uid()));
create policy marks_delete on public.marks for delete to authenticated
  using (app.has_role(school_id, 'school_admin'));

create policy report_card_remarks_select on public.report_card_remarks for select to authenticated
  using (
    app.has_role(school_id, 'school_admin')
    or app.teaches_student(student_id)
    or (
      approved_at is not null
      and app.is_family_of(student_id)
      and exists (select 1 from public.examinations ex where ex.id = examination_id and ex.status = 'published')
    )
  );
create policy report_card_remarks_write on public.report_card_remarks for all to authenticated
  using (app.has_role(school_id, 'school_admin') or app.teaches_student(student_id))
  with check (app.has_role(school_id, 'school_admin') or app.teaches_student(student_id));

-- ---------------------------------------------------------------------------
-- Fees and payments
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['fee_categories', 'fee_structures', 'fee_installments'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated using (app.is_member(school_id))', t);
    execute format(
      'create policy %1$s_write on public.%1$I for all to authenticated
         using (app.has_role(school_id, ''school_admin'', ''accountant''))
         with check (app.has_role(school_id, ''school_admin'', ''accountant''))', t);
  end loop;
end
$$;

create policy student_fees_select on public.student_fee_assignments for select to authenticated
  using (app.has_role(school_id, 'school_admin', 'accountant') or app.is_family_of(student_id));
create policy student_fees_write on public.student_fee_assignments for all to authenticated
  using (app.has_role(school_id, 'school_admin', 'accountant'))
  with check (app.has_role(school_id, 'school_admin', 'accountant'));

create policy payments_select on public.payments for select to authenticated
  using (app.has_role(school_id, 'school_admin', 'accountant') or app.is_family_of(student_id));
-- Staff record offline (cash/cheque/UPI-reference) receipts only. Gateway and
-- sandbox payments are written by the server after provider verification.
create policy payments_insert on public.payments for insert to authenticated
  with check (
    app.has_role(school_id, 'school_admin', 'accountant')
    and mode = 'offline'
    and recorded_by = (select auth.uid())
  );
create policy payments_void on public.payments for update to authenticated
  using (app.has_role(school_id, 'school_admin', 'accountant'))
  with check (app.has_role(school_id, 'school_admin', 'accountant'));

create policy payment_allocations_select on public.payment_allocations for select to authenticated
  using (
    app.has_role(school_id, 'school_admin', 'accountant')
    or exists (select 1 from public.payments p where p.id = payment_id and app.is_family_of(p.student_id))
  );
create policy payment_allocations_insert on public.payment_allocations for insert to authenticated
  with check (
    app.has_role(school_id, 'school_admin', 'accountant')
    and exists (select 1 from public.payments p where p.id = payment_id and p.mode = 'offline')
  );

create policy payment_orders_select on public.payment_orders for select to authenticated
  using (created_by = (select auth.uid()) or app.has_role(school_id, 'school_admin', 'accountant'));
create policy payment_orders_insert on public.payment_orders for insert to authenticated
  with check (created_by = (select auth.uid()) and app.is_family_of(student_id) and status = 'created');

create policy payment_webhook_events_select on public.payment_webhook_events for select to authenticated
  using (school_id is not null and app.has_role(school_id, 'school_admin', 'accountant'));

-- Next receipt number, e.g. SVM/2026-27/00042. Callable by fee staff; the
-- server also calls it in the trusted context after gateway verification.
create or replace function public.next_receipt_no(p_school uuid, p_year uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_no integer;
  v_prefix text;
  v_year text;
begin
  if auth.uid() is not null and not app.has_role(p_school, 'school_admin', 'accountant') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.receipt_counters (school_id, academic_year_id, last_no)
  values (p_school, p_year, 1)
  on conflict (school_id, academic_year_id) do update set last_no = public.receipt_counters.last_no + 1
  returning last_no into v_no;
  select coalesce(nullif(s.settings ->> 'receiptPrefix', ''), upper(left(regexp_replace(s.slug, '[^a-z]', '', 'g'), 3)))
    into v_prefix from public.schools s where s.id = p_school;
  select y.name into v_year from public.academic_years y where y.id = p_year and y.school_id = p_school;
  if v_year is null then
    raise exception 'academic year not found' using errcode = '23503';
  end if;
  return v_prefix || '/' || v_year || '/' || lpad(v_no::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Transport
-- ---------------------------------------------------------------------------
create policy vehicles_select on public.vehicles for select to authenticated
  using (
    app.is_school_staff(school_id)
    or exists (select 1 from public.transport_routes r where r.vehicle_id = vehicles.id and app.route_has_my_child(r.id))
  );
create policy vehicles_write on public.vehicles for all to authenticated
  using (app.manages_transport(school_id)) with check (app.manages_transport(school_id));

create policy drivers_select on public.drivers for select to authenticated
  using (
    app.manages_transport(school_id)
    or exists (select 1 from public.staff st where st.id = staff_id and st.user_id = (select auth.uid()))
    or exists (select 1 from public.transport_routes r where r.driver_id = drivers.id and app.route_has_my_child(r.id))
  );
create policy drivers_write on public.drivers for all to authenticated
  using (app.manages_transport(school_id)) with check (app.manages_transport(school_id));

create policy routes_select on public.transport_routes for select to authenticated
  using (app.is_school_staff(school_id) or app.route_has_my_child(id));
create policy routes_write on public.transport_routes for all to authenticated
  using (app.manages_transport(school_id)) with check (app.manages_transport(school_id));

create policy route_stops_select on public.route_stops for select to authenticated
  using (app.is_school_staff(school_id) or app.route_has_my_child(route_id));
create policy route_stops_write on public.route_stops for all to authenticated
  using (app.manages_transport(school_id)) with check (app.manages_transport(school_id));

create policy student_transport_select on public.student_transport_assignments for select to authenticated
  using (app.manages_transport(school_id) or app.has_role(school_id, 'accountant') or app.is_family_of(student_id));
create policy student_transport_write on public.student_transport_assignments for all to authenticated
  using (app.manages_transport(school_id)) with check (app.manages_transport(school_id));

create policy trips_select on public.transport_trips for select to authenticated
  using (app.manages_transport(school_id) or app.drives_route(route_id) or app.route_has_my_child(route_id));
create policy trips_insert on public.transport_trips for insert to authenticated
  with check (
    started_by = (select auth.uid())
    and status = 'in_progress'
    and (app.drives_route(route_id) or app.manages_transport(school_id))
  );
create policy trips_update on public.transport_trips for update to authenticated
  using (app.drives_route(route_id) or app.manages_transport(school_id))
  with check (app.drives_route(route_id) or app.manages_transport(school_id));

create policy tracking_devices_manage on public.tracking_devices for all to authenticated
  using (app.manages_transport(school_id)) with check (app.manages_transport(school_id));

-- Families only see positions of trips that are currently running on their
-- child's route; full history is limited to transport staff.
create policy locations_select on public.vehicle_location_events for select to authenticated
  using (
    app.manages_transport(school_id)
    or exists (
      select 1 from public.transport_trips t
      where t.id = trip_id
        and (app.drives_route(t.route_id) or (t.status = 'in_progress' and app.route_has_my_child(t.route_id)))
    )
  );
create policy locations_insert on public.vehicle_location_events for insert to authenticated
  with check (
    exists (
      select 1 from public.transport_trips t
      where t.id = trip_id and t.status = 'in_progress'
        and (
          (source = 'driver_app' and app.drives_route(t.route_id) and not t.is_simulated)
          or (source = 'simulator' and t.is_simulated and app.manages_transport(t.school_id))
        )
    )
  );

create policy pickup_events_select on public.pickup_dropoff_events for select to authenticated
  using (
    app.manages_transport(school_id)
    or app.is_family_of(student_id)
    or exists (select 1 from public.transport_trips t where t.id = trip_id and app.drives_route(t.route_id))
  );
create policy pickup_events_insert on public.pickup_dropoff_events for insert to authenticated
  with check (
    recorded_by = (select auth.uid())
    and exists (
      select 1 from public.transport_trips t
      join public.student_transport_assignments sta on sta.route_id = t.route_id and sta.student_id = pickup_dropoff_events.student_id and sta.end_date is null
      where t.id = trip_id and t.status = 'in_progress'
        and (app.drives_route(t.route_id) or app.manages_transport(t.school_id))
    )
  );

create policy transport_alerts_select on public.transport_alerts for select to authenticated
  using (
    app.manages_transport(school_id)
    or exists (
      select 1 from public.transport_trips t
      where t.id = trip_id and (app.drives_route(t.route_id) or app.route_has_my_child(t.route_id))
    )
  );
create policy transport_alerts_resolve on public.transport_alerts for update to authenticated
  using (app.manages_transport(school_id)) with check (app.manages_transport(school_id));

-- Minimal student details a driver needs for one trip. Drivers have no direct
-- access to the students, guardians or enrollments tables.
create or replace function public.get_trip_manifest(p_trip uuid)
returns table (
  student_id uuid,
  student_name text,
  class_section text,
  stop_id uuid,
  stop_name text,
  stop_order smallint,
  guardian_name text,
  guardian_phone text,
  boarded_at timestamptz,
  dropped_at timestamptz,
  not_present boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trip public.transport_trips;
begin
  select * into v_trip from public.transport_trips where id = p_trip;
  if v_trip.id is null or not (app.drives_route(v_trip.route_id) or app.manages_transport(v_trip.school_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select s.id,
           trim(s.first_name || ' ' || s.last_name),
           coalesce(c.name || ' - ' || sec.name, ''),
           rs.id, rs.name, rs.stop_order,
           g.full_name, g.phone,
           (select e.recorded_at from public.pickup_dropoff_events e where e.trip_id = p_trip and e.student_id = s.id and e.event_type = 'boarded'),
           (select e.recorded_at from public.pickup_dropoff_events e where e.trip_id = p_trip and e.student_id = s.id and e.event_type = 'dropped'),
           exists (select 1 from public.pickup_dropoff_events e where e.trip_id = p_trip and e.student_id = s.id and e.event_type = 'not_present')
    from public.student_transport_assignments sta
    join public.students s on s.id = sta.student_id and s.status = 'active'
    join public.route_stops rs on rs.id = sta.stop_id
    left join public.enrollments en on en.student_id = s.id and en.status = 'active'
    left join public.sections sec on sec.id = en.section_id
    left join public.classes c on c.id = sec.class_id
    left join lateral (
      select gg.full_name, gg.phone
      from public.student_guardians sg join public.guardians gg on gg.id = sg.guardian_id
      where sg.student_id = s.id
      order by sg.is_primary desc, sg.created_at
      limit 1
    ) g on true
    where sta.route_id = v_trip.route_id
      and sta.end_date is null
      and ((v_trip.trip_type = 'pickup' and sta.uses_pickup) or (v_trip.trip_type = 'drop' and sta.uses_drop))
    order by rs.stop_order, s.first_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activities and achievements
-- ---------------------------------------------------------------------------
create policy activities_select on public.extracurricular_activities for select to authenticated
  using (app.is_member(school_id));
create policy activities_admin on public.extracurricular_activities for all to authenticated
  using (app.has_role(school_id, 'school_admin'))
  with check (app.has_role(school_id, 'school_admin'));
create policy activities_coordinator_update on public.extracurricular_activities for update to authenticated
  using (app.coordinates_activity(id)) with check (app.coordinates_activity(id));

create policy activity_enrollments_select on public.activity_enrollments for select to authenticated
  using (
    app.has_role(school_id, 'school_admin') or app.coordinates_activity(activity_id)
    or app.teaches_student(student_id) or app.is_family_of(student_id)
  );
create policy activity_enrollments_staff on public.activity_enrollments for all to authenticated
  using (app.has_role(school_id, 'school_admin') or app.coordinates_activity(activity_id))
  with check (app.has_role(school_id, 'school_admin') or app.coordinates_activity(activity_id));
-- Families may register their child while registration is open, and withdraw.
create policy activity_enrollments_family_insert on public.activity_enrollments for insert to authenticated
  with check (
    app.is_family_of(student_id)
    and registered_by = (select auth.uid())
    and status = 'registered'
    and exists (
      select 1 from public.extracurricular_activities a
      where a.id = activity_id and a.registration_open and a.status = 'active'
    )
  );
create policy activity_enrollments_family_update on public.activity_enrollments for update to authenticated
  using (app.is_family_of(student_id))
  with check (app.is_family_of(student_id) and status = 'withdrawn');

create policy activity_attendance_select on public.activity_attendance for select to authenticated
  using (app.has_role(school_id, 'school_admin') or app.coordinates_activity(activity_id) or app.is_family_of(student_id));
create policy activity_attendance_write on public.activity_attendance for all to authenticated
  using (app.has_role(school_id, 'school_admin') or app.coordinates_activity(activity_id))
  with check (app.has_role(school_id, 'school_admin') or app.coordinates_activity(activity_id));

create policy achievements_select on public.student_achievements for select to authenticated
  using (
    app.has_role(school_id, 'school_admin') or app.teaches_student(student_id)
    or (activity_id is not null and app.coordinates_activity(activity_id))
    or app.is_family_of(student_id)
  );
create policy achievements_staff_write on public.student_achievements for all to authenticated
  using (
    app.has_role(school_id, 'school_admin') or app.teaches_student(student_id)
    or (activity_id is not null and app.coordinates_activity(activity_id))
  )
  with check (
    app.has_role(school_id, 'school_admin') or app.teaches_student(student_id)
    or (activity_id is not null and app.coordinates_activity(activity_id))
  );
-- Families can submit an achievement for verification; it starts as pending.
create policy achievements_family_insert on public.student_achievements for insert to authenticated
  with check (
    app.is_family_of(student_id) and submitted_by = (select auth.uid())
    and status = 'pending' and verified_by is null and verified_at is null
  );

-- ---------------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------------
create policy announcements_select on public.announcements for select to authenticated
  using (
    app.has_role(school_id, 'school_admin')
    or created_by = (select auth.uid())
    or (
      status = 'published'
      and app.is_member(school_id)
      and case audience
        when 'all' then true
        when 'staff' then app.is_school_staff(school_id)
        when 'parents' then app.has_role(school_id, 'parent')
        when 'students' then app.has_role(school_id, 'student')
        when 'section' then app.teaches_section(section_id) or app.family_in_section(section_id)
        else false
      end
    )
  );
create policy announcements_admin on public.announcements for all to authenticated
  using (app.has_role(school_id, 'school_admin'))
  with check (app.has_role(school_id, 'school_admin'));
create policy announcements_teacher on public.announcements for all to authenticated
  using (audience = 'section' and created_by = (select auth.uid()) and app.teaches_section(section_id))
  with check (audience = 'section' and created_by = (select auth.uid()) and app.teaches_section(section_id));

create policy notifications_own_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_own_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

create policy notification_preferences_own on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy ai_generations_select on public.ai_generations for select to authenticated
  using (user_id = (select auth.uid()) or app.has_role(school_id, 'school_admin'));
create policy ai_generations_insert on public.ai_generations for insert to authenticated
  with check (user_id = (select auth.uid()) and app.is_school_staff(school_id));
create policy ai_generations_update on public.ai_generations for update to authenticated
  using (user_id = (select auth.uid()) or app.has_role(school_id, 'school_admin'))
  with check (user_id = (select auth.uid()) or app.has_role(school_id, 'school_admin'));

-- ---------------------------------------------------------------------------
-- Audit triggers on sensitive records
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['schools', 'school_memberships', 'students', 'guardians', 'student_guardians', 'enrollments',
                           'attendance_records', 'marks', 'examinations', 'report_card_remarks',
                           'student_fee_assignments', 'payments', 'payment_allocations',
                           'student_achievements', 'staff', 'teacher_assignments', 'transport_trips', 'invitations']
  loop
    execute format(
      'create trigger %1$s_audit after insert or update or delete on public.%1$I
         for each row execute function app.audit_row_change()', t);
  end loop;
end
$$;

-- Functions callable by API clients
revoke all on function public.next_receipt_no(uuid, uuid) from public, anon;
grant execute on function public.next_receipt_no(uuid, uuid) to authenticated, service_role;
revoke all on function public.get_trip_manifest(uuid) from public, anon;
grant execute on function public.get_trip_manifest(uuid) to authenticated, service_role;
revoke all on function public.log_audit_event(uuid, text, text, text, jsonb, text) from public, anon;
grant execute on function public.log_audit_event(uuid, text, text, text, jsonb, text) to authenticated, service_role;
