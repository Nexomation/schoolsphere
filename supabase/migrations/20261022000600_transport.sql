-- School transport: vehicles, drivers, routes, trips and telemetry.

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  registration_no text not null check (registration_no ~ '^[A-Z0-9 -]{4,15}$'),
  vehicle_type text not null default 'van' check (vehicle_type in ('bus', 'mini_bus', 'van')),
  capacity smallint not null check (capacity between 1 and 100),
  make_model text,
  insurance_expiry date,
  fitness_expiry date,
  permit_expiry date,
  status text not null default 'active' check (status in ('active', 'maintenance', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, registration_no)
);
create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function app.set_updated_at();

-- Driver details for a staff member (the login comes from staff.user_id).
create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  staff_id uuid not null,
  license_no text not null,
  license_expiry date not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, staff_id),
  foreign key (school_id, staff_id) references public.staff (school_id, id) on delete cascade
);
create trigger drivers_updated_at before update on public.drivers
  for each row execute function app.set_updated_at();

create table public.transport_routes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  code text not null check (code ~ '^[A-Z0-9-]{1,12}$'),
  vehicle_id uuid,
  driver_id uuid,
  attendant_staff_id uuid,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, code),
  foreign key (school_id, vehicle_id) references public.vehicles (school_id, id) on delete set null (vehicle_id),
  foreign key (school_id, driver_id) references public.drivers (school_id, id) on delete set null (driver_id),
  foreign key (school_id, attendant_staff_id) references public.staff (school_id, id) on delete set null (attendant_staff_id)
);
create trigger transport_routes_updated_at before update on public.transport_routes
  for each row execute function app.set_updated_at();

create table public.route_stops (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  route_id uuid not null,
  stop_order smallint not null check (stop_order between 1 and 100),
  name text not null check (char_length(name) between 2 and 120),
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  pickup_time time,
  drop_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (route_id, stop_order) deferrable initially immediate,
  foreign key (school_id, route_id) references public.transport_routes (school_id, id) on delete cascade
);
create trigger route_stops_updated_at before update on public.route_stops
  for each row execute function app.set_updated_at();

create table public.student_transport_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  route_id uuid not null,
  stop_id uuid not null,
  uses_pickup boolean not null default true,
  uses_drop boolean not null default true,
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  check (uses_pickup or uses_drop),
  check (end_date is null or end_date >= start_date),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, route_id) references public.transport_routes (school_id, id) on delete cascade,
  foreign key (school_id, stop_id) references public.route_stops (school_id, id) on delete restrict
);
create unique index student_transport_one_active on public.student_transport_assignments (student_id) where end_date is null;
create index student_transport_route_idx on public.student_transport_assignments (route_id) where end_date is null;
create trigger student_transport_assignments_updated_at before update on public.student_transport_assignments
  for each row execute function app.set_updated_at();

-- The stop must belong to the assigned route.
create or replace function app.check_transport_stop_route()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.route_stops where id = new.stop_id and route_id = new.route_id) then
    raise exception 'Stop does not belong to the selected route' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger student_transport_stop_route before insert or update on public.student_transport_assignments
  for each row execute function app.check_transport_stop_route();

create table public.transport_trips (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  route_id uuid not null,
  vehicle_id uuid,
  driver_id uuid,
  trip_type text not null check (trip_type in ('pickup', 'drop')),
  trip_date date not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'cancelled')),
  -- true when locations come from the development simulator, never real GPS.
  is_simulated boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  started_by uuid references auth.users (id) on delete set null,
  last_location_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  check ((status = 'in_progress') = (ended_at is null)),
  foreign key (school_id, route_id) references public.transport_routes (school_id, id) on delete restrict,
  foreign key (school_id, vehicle_id) references public.vehicles (school_id, id) on delete set null (vehicle_id),
  foreign key (school_id, driver_id) references public.drivers (school_id, id) on delete set null (driver_id)
);
create unique index transport_trips_one_active_per_route on public.transport_trips (route_id) where status = 'in_progress';
create index transport_trips_school_date_idx on public.transport_trips (school_id, trip_date desc);

-- Hardware GPS trackers authenticate with a bearer token; only its hash is stored.
create table public.tracking_devices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  vehicle_id uuid not null,
  name text not null,
  token_hash text not null unique,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, vehicle_id) references public.vehicles (school_id, id) on delete cascade
);

create table public.vehicle_location_events (
  id bigint generated always as identity primary key,
  school_id uuid not null,
  vehicle_id uuid,
  trip_id uuid,
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  speed_kmh numeric(5, 1) check (speed_kmh is null or speed_kmh between 0 and 200),
  heading smallint check (heading is null or heading between 0 and 359),
  accuracy_m numeric(7, 1) check (accuracy_m is null or accuracy_m >= 0),
  source text not null check (source in ('device', 'driver_app', 'simulator')),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  foreign key (school_id, vehicle_id) references public.vehicles (school_id, id) on delete set null (vehicle_id),
  foreign key (school_id, trip_id) references public.transport_trips (school_id, id) on delete cascade
);
create index vehicle_location_trip_idx on public.vehicle_location_events (trip_id, recorded_at desc);
create index vehicle_location_vehicle_idx on public.vehicle_location_events (vehicle_id, recorded_at desc);

create table public.pickup_dropoff_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  trip_id uuid not null,
  student_id uuid not null,
  stop_id uuid,
  event_type text not null check (event_type in ('boarded', 'dropped', 'not_present')),
  recorded_by uuid references auth.users (id) on delete set null,
  recorded_at timestamptz not null default now(),
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  unique (school_id, id),
  unique (trip_id, student_id, event_type),
  foreign key (school_id, trip_id) references public.transport_trips (school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, stop_id) references public.route_stops (school_id, id) on delete set null (stop_id)
);

create table public.transport_alerts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  trip_id uuid not null,
  alert_type text not null check (alert_type in ('delay', 'route_deviation', 'no_signal', 'overspeed')),
  message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (school_id, id),
  foreign key (school_id, trip_id) references public.transport_trips (school_id, id) on delete cascade
);
create index transport_alerts_trip_idx on public.transport_alerts (trip_id, alert_type, created_at desc);
