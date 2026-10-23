-- Examinations, marks, grading and report cards.

-- bands: [{ "minPercent": 91, "grade": "A1", "gradePoint": 10, "remark": "Outstanding" }, ...]
-- sorted descending by minPercent; the lowest band must start at 0.
create table public.grade_scales (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  bands jsonb not null check (jsonb_typeof(bands) = 'array' and jsonb_array_length(bands) between 2 and 15),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, name)
);
create unique index grade_scales_one_default on public.grade_scales (school_id) where is_default;
create trigger grade_scales_updated_at before update on public.grade_scales
  for each row execute function app.set_updated_at();

create table public.examinations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid not null,
  term_id uuid,
  class_id uuid not null,
  grade_scale_id uuid,
  name text not null check (char_length(name) between 2 and 120),
  exam_type text not null default 'term' check (exam_type in ('unit_test', 'term', 'annual', 'other')),
  start_date date,
  end_date date,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'marks_entry', 'published')),
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (academic_year_id, class_id, name),
  check (end_date is null or start_date is null or end_date >= start_date),
  check ((status = 'published') = (published_at is not null)),
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete restrict,
  foreign key (school_id, term_id) references public.terms (school_id, id) on delete set null (term_id),
  foreign key (school_id, class_id) references public.classes (school_id, id) on delete restrict,
  foreign key (school_id, grade_scale_id) references public.grade_scales (school_id, id) on delete set null (grade_scale_id)
);
create trigger examinations_updated_at before update on public.examinations
  for each row execute function app.set_updated_at();

create table public.examination_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  examination_id uuid not null,
  subject_id uuid not null,
  exam_date date,
  max_marks numeric(6, 2) not null check (max_marks > 0 and max_marks <= 1000),
  pass_marks numeric(6, 2) not null check (pass_marks >= 0),
  created_at timestamptz not null default now(),
  unique (school_id, id),
  unique (examination_id, subject_id),
  check (pass_marks <= max_marks),
  foreign key (school_id, examination_id) references public.examinations (school_id, id) on delete cascade,
  foreign key (school_id, subject_id) references public.subjects (school_id, id) on delete restrict
);

-- Absent students are recorded explicitly (is_absent = true, marks null) and
-- are never silently treated as zero. See src/lib/domain/grading.ts.
create table public.marks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  examination_subject_id uuid not null,
  student_id uuid not null,
  marks_obtained numeric(6, 2),
  is_absent boolean not null default false,
  remarks text check (remarks is null or char_length(remarks) <= 300),
  entered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (examination_subject_id, student_id),
  check (
    (is_absent and marks_obtained is null)
    or (not is_absent and marks_obtained is not null and marks_obtained >= 0)
  ),
  foreign key (school_id, examination_subject_id) references public.examination_subjects (school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade
);
create index marks_student_idx on public.marks (student_id);
create trigger marks_updated_at before update on public.marks
  for each row execute function app.set_updated_at();

create or replace function app.check_marks_within_max()
returns trigger
language plpgsql
as $$
declare
  v_max numeric;
begin
  if new.marks_obtained is not null then
    select max_marks into v_max from public.examination_subjects where id = new.examination_subject_id;
    if new.marks_obtained > v_max then
      raise exception 'Marks (%) exceed the maximum (%)', new.marks_obtained, v_max using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger marks_within_max before insert or update on public.marks
  for each row execute function app.check_marks_within_max();

-- Class-teacher remarks on the report card. AI may draft a remark, but a human
-- must approve it before it is shown to families (approved_at not null).
create table public.report_card_remarks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  examination_id uuid not null,
  student_id uuid not null,
  remark text not null check (char_length(remark) between 2 and 1000),
  source text not null default 'human' check (source in ('human', 'ai_draft')),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (examination_id, student_id),
  foreign key (school_id, examination_id) references public.examinations (school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade
);
create trigger report_card_remarks_updated_at before update on public.report_card_remarks
  for each row execute function app.set_updated_at();
