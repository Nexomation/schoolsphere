-- Academic structure, people records and enrollment.

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (char_length(name) between 4 and 20), -- e.g. 2026-27
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, name),
  check (end_date > start_date)
);
create unique index academic_years_one_current on public.academic_years (school_id) where is_current;
create trigger academic_years_updated_at before update on public.academic_years
  for each row execute function app.set_updated_at();

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  sort_order smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (academic_year_id, name),
  check (end_date > start_date),
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete cascade
);
create trigger terms_updated_at before update on public.terms
  for each row execute function app.set_updated_at();

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40), -- LKG, UKG, Class 1 ... Class 12
  -- -2 = Pre-KG, -1 = LKG, 0 = UKG, 1..12 = standards. Used for ordering and promotion.
  grade_level smallint not null check (grade_level between -2 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, name),
  unique (school_id, grade_level)
);
create trigger classes_updated_at before update on public.classes
  for each row execute function app.set_updated_at();

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  code text not null check (code ~ '^[A-Z0-9_-]{2,12}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, code)
);
create trigger subjects_updated_at before update on public.subjects
  for each row execute function app.set_updated_at();

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  employee_code text not null check (char_length(employee_code) between 1 and 30),
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text,
  phone text,
  designation text not null default 'Teacher',
  staff_type text not null default 'teaching'
    check (staff_type in ('teaching', 'administrative', 'accounts', 'transport', 'support')),
  date_of_joining date,
  status text not null default 'active' check (status in ('active', 'on_leave', 'left')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, employee_code)
);
create unique index staff_user_per_school on public.staff (school_id, user_id) where user_id is not null;
create trigger staff_updated_at before update on public.staff
  for each row execute function app.set_updated_at();

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  class_id uuid not null,
  academic_year_id uuid not null,
  name text not null check (name ~ '^[A-Za-z0-9 -]{1,20}$'),
  class_teacher_id uuid,
  room text,
  capacity smallint check (capacity is null or capacity between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (class_id, academic_year_id, name),
  foreign key (school_id, class_id) references public.classes (school_id, id) on delete cascade,
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete cascade,
  foreign key (school_id, class_teacher_id) references public.staff (school_id, id) on delete set null (class_teacher_id)
);
create trigger sections_updated_at before update on public.sections
  for each row execute function app.set_updated_at();

-- Which teacher teaches which subject to which section. subject_id null means
-- the class-teacher style assignment (access to the whole section, all subjects).
create table public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  staff_id uuid not null,
  section_id uuid not null,
  subject_id uuid,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  unique nulls not distinct (staff_id, section_id, subject_id),
  foreign key (school_id, staff_id) references public.staff (school_id, id) on delete cascade,
  foreign key (school_id, section_id) references public.sections (school_id, id) on delete cascade,
  foreign key (school_id, subject_id) references public.subjects (school_id, id) on delete cascade
);
create index teacher_assignments_section_idx on public.teacher_assignments (section_id);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  admission_no text not null check (char_length(admission_no) between 1 and 30),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null default '',
  date_of_birth date not null check (date_of_birth > date '1990-01-01'),
  gender text not null check (gender in ('male', 'female', 'other')),
  blood_group text check (blood_group is null or blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  address text,
  emis_no text, -- Tamil Nadu EMIS identifier
  admission_date date not null default current_date,
  status text not null default 'active' check (status in ('active', 'transferred', 'graduated', 'withdrawn')),
  status_changed_at timestamptz,
  medical_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, admission_no)
);
create unique index students_user_per_school on public.students (school_id, user_id) where user_id is not null;
create index students_name_idx on public.students (school_id, lower(first_name), lower(last_name));
create trigger students_updated_at before update on public.students
  for each row execute function app.set_updated_at();

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text not null check (phone ~ '^\+?[0-9]{10,13}$'),
  email text,
  occupation text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, phone)
);
create unique index guardians_user_per_school on public.guardians (school_id, user_id) where user_id is not null;
create trigger guardians_updated_at before update on public.guardians
  for each row execute function app.set_updated_at();

-- A guardian sees a student only once the link is verified by school staff.
create table public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  guardian_id uuid not null,
  relationship text not null check (relationship in ('father', 'mother', 'guardian', 'grandparent', 'sibling', 'other')),
  is_primary boolean not null default false,
  can_pickup boolean not null default true,
  verified_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  unique (student_id, guardian_id),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, guardian_id) references public.guardians (school_id, id) on delete cascade
);
create index student_guardians_guardian_idx on public.student_guardians (guardian_id);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  section_id uuid not null,
  academic_year_id uuid not null,
  roll_no smallint check (roll_no is null or roll_no between 1 and 500),
  status text not null default 'active' check (status in ('active', 'promoted', 'transferred', 'completed', 'withdrawn')),
  enrolled_on date not null default current_date,
  left_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (student_id, academic_year_id),
  unique (section_id, roll_no),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, section_id) references public.sections (school_id, id) on delete restrict,
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete restrict
);
create index enrollments_section_idx on public.enrollments (section_id) where status = 'active';
create trigger enrollments_updated_at before update on public.enrollments
  for each row execute function app.set_updated_at();

create table public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  section_id uuid not null,
  day_of_week smallint not null check (day_of_week between 1 and 6), -- 1 = Monday
  period_no smallint not null check (period_no between 1 and 12),
  start_time time not null,
  end_time time not null,
  subject_id uuid,
  staff_id uuid,
  room text,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  unique (section_id, day_of_week, period_no),
  check (end_time > start_time),
  foreign key (school_id, section_id) references public.sections (school_id, id) on delete cascade,
  foreign key (school_id, subject_id) references public.subjects (school_id, id) on delete set null (subject_id),
  foreign key (school_id, staff_id) references public.staff (school_id, id) on delete set null (staff_id)
);
-- A teacher cannot be in two sections at the same time.
create unique index timetable_staff_slot on public.timetable_entries (staff_id, day_of_week, period_no) where staff_id is not null;

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid,
  title text not null check (char_length(title) between 2 and 200),
  description text,
  event_type text not null check (event_type in ('holiday', 'exam', 'event', 'ptm', 'other')),
  start_date date not null,
  end_date date not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  check (end_date >= start_date),
  foreign key (school_id) references public.schools (id) on delete cascade,
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete cascade
);
create index calendar_events_range_idx on public.calendar_events (school_id, start_date, end_date);
create trigger calendar_events_updated_at before update on public.calendar_events
  for each row execute function app.set_updated_at();
