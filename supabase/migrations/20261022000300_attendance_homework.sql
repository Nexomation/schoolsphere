-- Attendance, homework and assignment submissions.

-- subject_id null = the official daily (homeroom) attendance used for
-- attendance percentages. Subject-wise records are optional and informational.
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  section_id uuid not null,
  subject_id uuid,
  attendance_date date not null,
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  remarks text check (remarks is null or char_length(remarks) <= 300),
  marked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique nulls not distinct (student_id, attendance_date, subject_id),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, section_id) references public.sections (school_id, id) on delete cascade,
  foreign key (school_id, subject_id) references public.subjects (school_id, id) on delete cascade
);
create index attendance_section_date_idx on public.attendance_records (section_id, attendance_date);
create index attendance_student_date_idx on public.attendance_records (student_id, attendance_date);
create trigger attendance_records_updated_at before update on public.attendance_records
  for each row execute function app.set_updated_at();

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  section_id uuid not null,
  subject_id uuid not null,
  created_by_staff_id uuid,
  title text not null check (char_length(title) between 3 and 200),
  description text not null default '' check (char_length(description) <= 10000),
  due_at timestamptz not null,
  max_marks numeric(6, 2) check (max_marks is null or max_marks > 0),
  allow_late_submission boolean not null default true,
  status text not null default 'published' check (status in ('draft', 'published', 'closed')),
  published_at timestamptz,
  is_ai_assisted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, section_id) references public.sections (school_id, id) on delete cascade,
  foreign key (school_id, subject_id) references public.subjects (school_id, id) on delete restrict,
  foreign key (school_id, created_by_staff_id) references public.staff (school_id, id) on delete set null (created_by_staff_id)
);
create index assignments_section_due_idx on public.assignments (section_id, due_at desc);
create trigger assignments_updated_at before update on public.assignments
  for each row execute function app.set_updated_at();

-- Per-student deadline extensions granted by the teacher.
create table public.assignment_extensions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  assignment_id uuid not null,
  student_id uuid not null,
  extended_due_at timestamptz not null,
  reason text not null check (char_length(reason) between 3 and 300),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  unique (assignment_id, student_id),
  foreign key (school_id, assignment_id) references public.assignments (school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade
);

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  assignment_id uuid not null,
  student_id uuid not null,
  content text not null default '' check (char_length(content) <= 20000),
  submitted_at timestamptz not null default now(),
  is_late boolean not null default false,
  status text not null default 'submitted' check (status in ('submitted', 'graded', 'returned')),
  marks_awarded numeric(6, 2) check (marks_awarded is null or marks_awarded >= 0),
  feedback text check (feedback is null or char_length(feedback) <= 5000),
  graded_by uuid references auth.users (id) on delete set null,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (assignment_id, student_id),
  check ((status = 'graded') = (graded_at is not null)),
  foreign key (school_id, assignment_id) references public.assignments (school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade
);
create index assignment_submissions_student_idx on public.assignment_submissions (student_id);
create trigger assignment_submissions_updated_at before update on public.assignment_submissions
  for each row execute function app.set_updated_at();

create or replace function app.check_submission_marks()
returns trigger
language plpgsql
as $$
declare
  v_max numeric;
begin
  if new.marks_awarded is not null then
    select max_marks into v_max from public.assignments where id = new.assignment_id;
    if v_max is null then
      raise exception 'This assignment is not marked' using errcode = '23514';
    end if;
    if new.marks_awarded > v_max then
      raise exception 'Marks awarded (%) exceed maximum (%)', new.marks_awarded, v_max using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger assignment_submissions_marks_check before insert or update on public.assignment_submissions
  for each row execute function app.check_submission_marks();

-- Uploaded files (assignment attachments, submissions, certificates). The bytes
-- live in Supabase Storage (or the local dev driver); this table is the access
-- control record that the download endpoint checks.
create table public.file_objects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  entity_type text not null check (entity_type in ('assignment', 'submission', 'achievement')),
  entity_id uuid not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, id)
);
create index file_objects_entity_idx on public.file_objects (entity_type, entity_id);
