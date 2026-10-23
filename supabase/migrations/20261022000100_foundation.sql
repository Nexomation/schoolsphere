-- SchoolSphere foundation: tenancy, identity, memberships, audit.
--
-- Conventions used across all migrations
--   * Every tenant-owned table has `school_id` and a `unique (school_id, id)`
--     key. Child tables reference parents with composite foreign keys
--     `(school_id, parent_id)`, so a row can never point at another school's
--     data even if application code has a bug.
--   * Money is stored as integer paise (bigint). See 20261022000500_fees.sql.
--   * Calendar dates are `date`; instants are `timestamptz`. School-local dates
--     are computed in the school's timezone (Asia/Kolkata by default).
--   * Row Level Security is enabled on every table in 20261022000800_rls.sql.

create schema if not exists app;
comment on schema app is 'Private helper functions for SchoolSphere. Not exposed through the API.';

create type public.school_role as enum (
  'school_admin',
  'accountant',
  'teacher',
  'parent',
  'student',
  'transport_coordinator',
  'driver'
);

create type public.membership_status as enum ('invited', 'active', 'suspended');

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Schools (tenants)
-- ---------------------------------------------------------------------------
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,58})[a-z0-9]$'),
  board text not null default 'STATE_BOARD'
    check (board in ('STATE_BOARD', 'MATRICULATION', 'CBSE', 'ICSE', 'IB', 'IGCSE', 'OTHER')),
  address_line1 text,
  address_line2 text,
  city text,
  district text,
  state text not null default 'Tamil Nadu',
  pincode text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  phone text,
  email text,
  website text,
  udise_code text,
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR' check (currency = 'INR'),
  -- { "appName": "...", "primaryColor": "#4f46e5", "logoUrl": "..." }
  branding jsonb not null default '{}'::jsonb check (jsonb_typeof(branding) = 'object'),
  -- Attendance policy, working days, late/excused rules. See src/lib/domain/attendance.ts
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  status text not null default 'onboarding' check (status in ('onboarding', 'active', 'suspended')),
  is_demo boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger schools_updated_at before update on public.schools
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- People and access
-- ---------------------------------------------------------------------------
create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 200),
  email text not null,
  phone text,
  avatar_url text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'ta')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger user_profiles_updated_at before update on public.user_profiles
  for each row execute function app.set_updated_at();

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.school_role not null,
  status public.membership_status not null default 'active',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, user_id, role)
);
create index school_memberships_user_idx on public.school_memberships (user_id) where status = 'active';
create trigger school_memberships_updated_at before update on public.school_memberships
  for each row execute function app.set_updated_at();

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name text not null,
  role public.school_role not null,
  -- Optional record the new account is linked to on acceptance.
  staff_id uuid,
  guardian_id uuid,
  student_id uuid,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index invitations_school_idx on public.invitations (school_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  -- Deliberately no foreign key: audit history must outlive deleted tenants.
  school_id uuid,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_logs_school_idx on public.audit_logs (school_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

-- Nobody, including the service role, may rewrite history.
create or replace function app.audit_logs_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function app.audit_logs_immutable();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function app.audit_logs_immutable();

-- Generic row-change audit trigger. The acting user comes from the JWT claims;
-- an optional reason can be supplied per transaction with
--   select set_config('app.change_reason', 'Corrected after parent query', true);
create or replace function app.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_school uuid;
  v_id text;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    if v_old - 'updated_at' = v_new - 'updated_at' then
      return new; -- no material change
    end if;
  else
    v_new := to_jsonb(new);
  end if;

  v_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  v_school := coalesce(
    v_new ->> 'school_id',
    v_old ->> 'school_id',
    case when tg_table_name = 'schools' then v_id end
  )::uuid;

  insert into public.audit_logs (school_id, actor_user_id, action, entity_type, entity_id, old_data, new_data, reason)
  values (
    v_school,
    -- Trusted server jobs record the user they act for in app.actor_id.
    coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid),
    lower(tg_op),
    tg_table_name,
    v_id,
    v_old,
    v_new,
    nullif(current_setting('app.change_reason', true), '')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Explicit application events (sign-ins, publishing results, exports...).
create or replace function public.log_audit_event(
  p_school_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_data jsonb default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_school_id is not null and not exists (
    select 1 from public.school_memberships m
    where m.school_id = p_school_id and m.user_id = auth.uid() and m.status = 'active'
  ) and not exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()) then
    raise exception 'not a member of this school' using errcode = '42501';
  end if;
  insert into public.audit_logs (school_id, actor_user_id, action, entity_type, entity_id, new_data, reason)
  values (p_school_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_data, p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- Public demo/contact requests from the marketing site
-- ---------------------------------------------------------------------------
create table public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  school_name text not null check (char_length(school_name) between 2 and 200),
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  email text not null,
  phone text not null,
  city text,
  student_count integer check (student_count is null or student_count between 1 and 50000),
  message text check (message is null or char_length(message) <= 2000),
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'closed')),
  created_at timestamptz not null default now()
);
