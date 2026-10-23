-- Supabase compatibility layer for LOCAL development databases only.
--
-- Supabase projects already provide the `auth` schema, the `anon`,
-- `authenticated` and `service_role` roles, and `auth.uid()`. When the app runs
-- against PGlite (the default local mode) or a plain PostgreSQL server, this
-- file recreates the minimal subset the migrations depend on, with the same
-- names and semantics, so the exact same migrations and RLS policies run in
-- both places.
--
-- NEVER apply this file to a Supabase project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  banned_until timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists users_email_key on auth.users (lower(email));

-- Server-side sessions for the local auth provider (Supabase manages its own).
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text
);
create index if not exists sessions_user_idx on auth.sessions (user_id);

-- Password-reset tokens for the local auth provider. Only hashes are stored.
create table if not exists auth.local_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('password_reset')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Same definition Supabase uses: the caller's id comes from the JWT claims the
-- server sets with set_config('request.jwt.claims', ..., true).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;

-- Roles in Supabase can read public objects that are explicitly granted; mirror
-- the schema usage grant.
grant usage on schema public to anon, authenticated, service_role;
