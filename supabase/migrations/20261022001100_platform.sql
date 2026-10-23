-- Platform (SaaS operator) metrics. Platform administrators manage tenants but
-- have no RLS access to children's records; they see counts only, through
-- this function.

create or replace function public.platform_school_metrics()
returns table (
  school_id uuid,
  name text,
  slug text,
  city text,
  status text,
  is_demo boolean,
  created_at timestamptz,
  onboarding_completed_at timestamptz,
  students integer,
  staff integer,
  members integer,
  last_activity timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select s.id, s.name, s.slug, s.city, s.status, s.is_demo, s.created_at, s.onboarding_completed_at,
           (select count(*)::integer from public.students x where x.school_id = s.id and x.status = 'active'),
           (select count(*)::integer from public.staff x where x.school_id = s.id and x.status = 'active'),
           (select count(*)::integer from public.school_memberships x where x.school_id = s.id and x.status = 'active'),
           (select max(l.created_at) from public.audit_logs l where l.school_id = s.id and l.actor_user_id is not null)
    from public.schools s
    order by s.created_at desc;
end;
$$;

revoke all on function public.platform_school_metrics() from public, anon;
grant execute on function public.platform_school_metrics() to authenticated, service_role;
