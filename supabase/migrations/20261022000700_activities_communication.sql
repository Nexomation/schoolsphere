-- Extracurricular activities, achievements, announcements, notifications, AI drafts.

create table public.extracurricular_activities (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid not null,
  name text not null check (char_length(name) between 2 and 120),
  category text not null check (category in (
    'sports', 'arts_music', 'robotics_stem', 'clubs', 'competitions', 'leadership_volunteering', 'projects_exhibitions', 'other'
  )),
  description text,
  coordinator_staff_id uuid,
  schedule text,
  venue text,
  start_date date,
  end_date date,
  capacity smallint check (capacity is null or capacity between 1 and 1000),
  registration_open boolean not null default true,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (academic_year_id, name),
  check (end_date is null or start_date is null or end_date >= start_date),
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete restrict,
  foreign key (school_id, coordinator_staff_id) references public.staff (school_id, id) on delete set null (coordinator_staff_id)
);
create trigger extracurricular_activities_updated_at before update on public.extracurricular_activities
  for each row execute function app.set_updated_at();

create table public.activity_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  activity_id uuid not null,
  student_id uuid not null,
  status text not null default 'registered' check (status in ('registered', 'withdrawn')),
  registered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (activity_id, student_id),
  foreign key (school_id, activity_id) references public.extracurricular_activities (school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade
);
create trigger activity_enrollments_updated_at before update on public.activity_enrollments
  for each row execute function app.set_updated_at();

create table public.activity_attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  activity_id uuid not null,
  student_id uuid not null,
  session_date date not null,
  status text not null check (status in ('present', 'absent')),
  marked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  unique (activity_id, student_id, session_date),
  foreign key (school_id, activity_id) references public.extracurricular_activities (school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade
);

create table public.student_achievements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  activity_id uuid,
  category text not null check (category in (
    'sports', 'arts_music', 'robotics_stem', 'clubs', 'competitions', 'leadership_volunteering', 'projects_exhibitions', 'academic', 'other'
  )),
  title text not null check (char_length(title) between 3 and 200),
  description text,
  level text not null default 'school' check (level in ('school', 'zonal', 'district', 'state', 'national', 'international')),
  position text,
  achieved_on date not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  submitted_by uuid references auth.users (id) on delete set null,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  check ((status = 'pending') = (verified_at is null)),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, activity_id) references public.extracurricular_activities (school_id, id) on delete set null (activity_id)
);
create index student_achievements_student_idx on public.student_achievements (student_id, achieved_on desc);
create trigger student_achievements_updated_at before update on public.student_achievements
  for each row execute function app.set_updated_at();

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 200),
  body text not null check (char_length(body) between 1 and 10000),
  audience text not null default 'all' check (audience in ('all', 'staff', 'parents', 'students', 'section')),
  section_id uuid,
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  is_ai_assisted boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  check ((audience = 'section') = (section_id is not null)),
  check ((status = 'draft') or (published_at is not null)),
  foreign key (school_id, section_id) references public.sections (school_id, id) on delete cascade
);
create index announcements_school_idx on public.announcements (school_id, published_at desc);
create trigger announcements_updated_at before update on public.announcements
  for each row execute function app.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in (
    'attendance', 'homework', 'marks', 'fees', 'announcement', 'event', 'transport', 'activity', 'admin'
  )),
  title text not null,
  body text not null default '',
  link text check (link is null or link ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in (
    'attendance', 'homework', 'marks', 'fees', 'announcement', 'event', 'transport', 'activity', 'admin'
  )),
  in_app boolean not null default true,
  email boolean not null default false,
  push boolean not null default false,
  whatsapp boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

-- External channel delivery attempts (email, push, WhatsApp). In-app delivery
-- is the notifications row itself.
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('email', 'push', 'whatsapp')),
  status text not null check (status in ('sent', 'failed', 'skipped_not_configured', 'skipped_by_policy')),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now()
);

-- AI outputs that need human review before they affect students or families.
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null check (feature in (
    'worksheet', 'circular', 'class_trends', 'student_summary', 'report_explainer', 'assistant_query', 'support_suggestions'
  )),
  input_summary text not null,
  output text not null,
  provider text not null,
  model text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'discarded')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index ai_generations_user_idx on public.ai_generations (user_id, created_at desc);
