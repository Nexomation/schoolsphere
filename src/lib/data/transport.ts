import "server-only";
import { z } from "zod";
import { connectionStatus, delayMinutes, distanceFromRouteMeters, estimateArrivals, DEVIATION_THRESHOLD_M, type Stop } from "../domain/geo";
import { todayIn } from "../domain/dates";
import type { Sql } from "../db/types";
import { AppError, ForbiddenError } from "../errors";
import { driverInput, routeInput, stopInput, studentRouteInput, vehicleInput, type TelemetryInput } from "../schemas/transport";

// ---------------------------------------------------------------- fleet
export async function listVehicles(sql: Sql, schoolId: string) {
  return sql.many<{ id: string; registration_no: string; vehicle_type: string; capacity: number; make_model: string | null; insurance_expiry: string | null; fitness_expiry: string | null; permit_expiry: string | null; status: string; route: string | null }>(
    `select v.id, v.registration_no, v.vehicle_type, v.capacity, v.make_model, v.insurance_expiry, v.fitness_expiry, v.permit_expiry, v.status,
            (select string_agg(r.code, ', ') from transport_routes r where r.vehicle_id = v.id) as route
     from vehicles v where v.school_id = $1 order by v.registration_no`,
    [schoolId],
  );
}

export async function saveVehicle(sql: Sql, schoolId: string, input: z.output<typeof vehicleInput>) {
  if (input.id) {
    const rows = await sql.many(
      `update vehicles set registration_no = $3, vehicle_type = $4, capacity = $5, make_model = $6, insurance_expiry = $7, fitness_expiry = $8, permit_expiry = $9, status = $10
       where id = $1 and school_id = $2 returning id`,
      [input.id, schoolId, input.registrationNo, input.vehicleType, input.capacity, input.makeModel, input.insuranceExpiry, input.fitnessExpiry, input.permitExpiry, input.status],
    );
    if (!rows.length) throw new AppError("Vehicle not found", "not_found");
    return;
  }
  await sql.exec(
    `insert into vehicles (school_id, registration_no, vehicle_type, capacity, make_model, insurance_expiry, fitness_expiry, permit_expiry, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [schoolId, input.registrationNo, input.vehicleType, input.capacity, input.makeModel, input.insuranceExpiry, input.fitnessExpiry, input.permitExpiry, input.status],
  );
}

export async function listDrivers(sql: Sql, schoolId: string) {
  return sql.many<{ id: string; staff_id: string; name: string; phone: string | null; license_no: string; license_expiry: string; status: string; has_login: boolean; route: string | null }>(
    `select d.id, d.staff_id, st.full_name as name, st.phone, d.license_no, d.license_expiry, d.status, st.user_id is not null as has_login,
            (select string_agg(r.code, ', ') from transport_routes r where r.driver_id = d.id) as route
     from drivers d join staff st on st.id = d.staff_id where d.school_id = $1 order by st.full_name`,
    [schoolId],
  );
}

export async function saveDriver(sql: Sql, schoolId: string, input: z.output<typeof driverInput>) {
  await sql.exec(
    `insert into drivers (school_id, staff_id, license_no, license_expiry) values ($1, $2, $3, $4)
     on conflict (school_id, staff_id) do update set license_no = excluded.license_no, license_expiry = excluded.license_expiry, status = 'active'`,
    [schoolId, input.staffId, input.licenseNo, input.licenseExpiry],
  );
}

// ---------------------------------------------------------------- routes and stops
export type RouteRow = {
  id: string;
  name: string;
  code: string;
  status: string;
  vehicle_id: string | null;
  vehicle: string | null;
  capacity: number | null;
  driver_id: string | null;
  driver: string | null;
  attendant_staff_id: string | null;
  attendant: string | null;
  stops: number;
  students: number;
  active_trip_id: string | null;
};

export async function listRoutes(sql: Sql, schoolId: string): Promise<RouteRow[]> {
  return sql.many<RouteRow>(
    `select r.id, r.name, r.code, r.status, r.vehicle_id, v.registration_no as vehicle, v.capacity, r.driver_id, ds.full_name as driver,
            r.attendant_staff_id, ast.full_name as attendant,
            (select count(*)::int from route_stops s where s.route_id = r.id) as stops,
            (select count(*)::int from student_transport_assignments a where a.route_id = r.id and a.end_date is null) as students,
            (select t.id from transport_trips t where t.route_id = r.id and t.status = 'in_progress' limit 1) as active_trip_id
     from transport_routes r left join vehicles v on v.id = r.vehicle_id
     left join drivers d on d.id = r.driver_id left join staff ds on ds.id = d.staff_id
     left join staff ast on ast.id = r.attendant_staff_id
     where r.school_id = $1 order by r.code`,
    [schoolId],
  );
}

export async function saveRoute(sql: Sql, schoolId: string, input: z.output<typeof routeInput>) {
  if (input.id) {
    const rows = await sql.many(
      "update transport_routes set name = $3, code = $4, vehicle_id = $5, driver_id = $6, attendant_staff_id = $7 where id = $1 and school_id = $2 returning id",
      [input.id, schoolId, input.name, input.code, input.vehicleId, input.driverId, input.attendantStaffId],
    );
    if (!rows.length) throw new AppError("Route not found", "not_found");
    return input.id;
  }
  return (
    await sql.one<{ id: string }>(
      "insert into transport_routes (school_id, name, code, vehicle_id, driver_id, attendant_staff_id) values ($1, $2, $3, $4, $5, $6) returning id",
      [schoolId, input.name, input.code, input.vehicleId, input.driverId, input.attendantStaffId],
    )
  ).id;
}

export type StopRow = { id: string; stop_order: number; name: string; latitude: number; longitude: number; pickup_time: string | null; drop_time: string | null; students: number };

export async function routeStops(sql: Sql, routeId: string): Promise<StopRow[]> {
  return sql.many<StopRow>(
    `select s.id, s.stop_order, s.name, s.latitude, s.longitude, s.pickup_time, s.drop_time,
            (select count(*)::int from student_transport_assignments a where a.stop_id = s.id and a.end_date is null) as students
     from route_stops s where s.route_id = $1 order by s.stop_order`,
    [routeId],
  );
}

export async function saveStop(sql: Sql, schoolId: string, input: z.output<typeof stopInput>) {
  if (input.id) {
    await sql.exec(
      "update route_stops set name = $3, latitude = $4, longitude = $5, pickup_time = $6, drop_time = $7 where id = $1 and school_id = $2",
      [input.id, schoolId, input.name, input.latitude, input.longitude, input.pickupTime, input.dropTime],
    );
    return;
  }
  const next = await sql.one<{ n: number }>("select coalesce(max(stop_order), 0)::int + 1 as n from route_stops where route_id = $1", [input.routeId]);
  await sql.exec(
    "insert into route_stops (school_id, route_id, stop_order, name, latitude, longitude, pickup_time, drop_time) values ($1, $2, $3, $4, $5, $6, $7, $8)",
    [schoolId, input.routeId, next.n, input.name, input.latitude, input.longitude, input.pickupTime, input.dropTime],
  );
}

/** Moves a stop up or down by swapping orders (the unique constraint is deferred for this). */
export async function moveStop(sql: Sql, schoolId: string, stopId: string, direction: -1 | 1) {
  const s = await sql.one<{ route_id: string; stop_order: number }>("select route_id, stop_order from route_stops where id = $1 and school_id = $2", [stopId, schoolId]);
  const other = await sql.maybeOne<{ id: string; stop_order: number }>("select id, stop_order from route_stops where route_id = $1 and stop_order = $2", [s.route_id, s.stop_order + direction]);
  if (!other) return;
  await sql.exec("set constraints route_stops_route_id_stop_order_key deferred");
  await sql.exec("update route_stops set stop_order = $2 where id = $1", [stopId, other.stop_order]);
  await sql.exec("update route_stops set stop_order = $2 where id = $1", [other.id, s.stop_order]);
}

export async function deleteStop(sql: Sql, schoolId: string, stopId: string) {
  const used = await sql.one<{ n: number }>("select count(*)::int as n from student_transport_assignments where stop_id = $1 and end_date is null", [stopId]);
  if (used.n) throw new AppError("Move the students at this stop to another stop first.");
  const s = await sql.one<{ route_id: string; stop_order: number }>("delete from route_stops where id = $1 and school_id = $2 returning route_id, stop_order", [stopId, schoolId]);
  await sql.exec("set constraints route_stops_route_id_stop_order_key deferred");
  await sql.exec("update route_stops set stop_order = stop_order - 1 where route_id = $1 and stop_order > $2", [s.route_id, s.stop_order]);
}

export async function routeStudents(sql: Sql, routeId: string) {
  return sql.many<{ assignment_id: string; student_id: string; name: string; section_label: string | null; stop_id: string; stop_name: string; stop_order: number; uses_pickup: boolean; uses_drop: boolean }>(
    `select a.id as assignment_id, s.id as student_id, trim(s.first_name || ' ' || s.last_name) as name, c.name || ' ' || sec.name as section_label,
            rs.id as stop_id, rs.name as stop_name, rs.stop_order, a.uses_pickup, a.uses_drop
     from student_transport_assignments a join students s on s.id = a.student_id join route_stops rs on rs.id = a.stop_id
     left join enrollments e on e.student_id = s.id and e.status = 'active' left join sections sec on sec.id = e.section_id left join classes c on c.id = sec.class_id
     where a.route_id = $1 and a.end_date is null order by rs.stop_order, s.first_name`,
    [routeId],
  );
}

export async function assignStudentToRoute(sql: Sql, schoolId: string, input: z.output<typeof studentRouteInput>, today: string) {
  // End any current assignment, then start the new one (history is kept).
  await sql.exec("update student_transport_assignments set end_date = $2 where student_id = $1 and end_date is null", [input.studentId, today]);
  await sql.exec(
    `insert into student_transport_assignments (school_id, student_id, route_id, stop_id, uses_pickup, uses_drop, start_date) values ($1, $2, $3, $4, $5, $6, $7)`,
    [schoolId, input.studentId, input.routeId, input.stopId, input.usesPickup, input.usesDrop, today],
  );
}

export async function endStudentAssignment(sql: Sql, schoolId: string, assignmentId: string, today: string) {
  await sql.exec("update student_transport_assignments set end_date = $3 where id = $1 and school_id = $2 and end_date is null", [assignmentId, schoolId, today]);
}

// ---------------------------------------------------------------- trips
export async function startTrip(sql: Sql, ctx: { schoolId: string; userId: string }, routeId: string, tripType: "pickup" | "drop", simulated: boolean) {
  const route = await sql.maybeOne<{ vehicle_id: string | null; driver_id: string | null; status: string }>(
    "select vehicle_id, driver_id, status from transport_routes where id = $1 and school_id = $2",
    [routeId, ctx.schoolId],
  );
  if (!route) throw new AppError("Route not found", "not_found");
  if (route.status !== "active") throw new AppError("This route is inactive.");
  const existing = await sql.maybeOne<{ id: string }>("select id from transport_trips where route_id = $1 and status = 'in_progress'", [routeId]);
  if (existing) return existing.id;
  const tz = await sql.one<{ timezone: string }>("select timezone from schools where id = $1", [ctx.schoolId]);
  const trip = await sql.one<{ id: string }>(
    `insert into transport_trips (school_id, route_id, vehicle_id, driver_id, trip_type, trip_date, is_simulated, started_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [ctx.schoolId, routeId, route.vehicle_id, route.driver_id, tripType, todayIn(tz.timezone), simulated, ctx.userId],
  );
  return trip.id;
}

export async function endTrip(sql: Sql, tripId: string) {
  const rows = await sql.many("update transport_trips set status = 'completed', ended_at = now() where id = $1 and status = 'in_progress' returning id", [tripId]);
  if (!rows.length) throw new AppError("This trip is not running.");
  await sql.exec("update transport_alerts set resolved_at = now() where trip_id = $1 and resolved_at is null", [tripId]);
}

export type TripSummary = {
  id: string;
  route_id: string;
  route_name: string;
  route_code: string;
  trip_type: string;
  status: string;
  is_simulated: boolean;
  started_at: string;
  ended_at: string | null;
  last_location_at: string | null;
  vehicle: string | null;
  driver: string | null;
  open_alerts: number;
};

export async function listTrips(sql: Sql, schoolId: string, opts: { active?: boolean; limit?: number; routeId?: string } = {}): Promise<TripSummary[]> {
  return sql.many<TripSummary>(
    `select t.id, t.route_id, r.name as route_name, r.code as route_code, t.trip_type, t.status, t.is_simulated, t.started_at, t.ended_at, t.last_location_at,
            v.registration_no as vehicle, st.full_name as driver,
            (select count(*)::int from transport_alerts a where a.trip_id = t.id and a.resolved_at is null) as open_alerts
     from transport_trips t join transport_routes r on r.id = t.route_id
     left join vehicles v on v.id = t.vehicle_id left join drivers d on d.id = t.driver_id left join staff st on st.id = d.staff_id
     where t.school_id = $1 and ($2::boolean is null or (t.status = 'in_progress') = $2) and ($4::uuid is null or t.route_id = $4)
     order by t.started_at desc limit $3`,
    [schoolId, opts.active ?? null, opts.limit ?? 50, opts.routeId ?? null],
  );
}

/** Live view of one trip. RLS decides who may load it (transport staff, the driver, families on the route while it runs). */
export async function liveTrip(sql: Sql, tripId: string) {
  const trip = await sql.maybeOne<TripSummary & { school_id: string; trip_date: string }>(
    `select t.id, t.school_id, t.route_id, r.name as route_name, r.code as route_code, t.trip_type, t.status, t.is_simulated, t.started_at, t.ended_at,
            t.last_location_at, t.trip_date, v.registration_no as vehicle, st.full_name as driver,
            (select count(*)::int from transport_alerts a where a.trip_id = t.id and a.resolved_at is null) as open_alerts
     from transport_trips t join transport_routes r on r.id = t.route_id
     left join vehicles v on v.id = t.vehicle_id left join drivers d on d.id = t.driver_id left join staff st on st.id = d.staff_id
     where t.id = $1`,
    [tripId],
  );
  if (!trip) return null;
  const stops = await routeStops(sql, trip.route_id);
  const fixes = await sql.many<{ latitude: number; longitude: number; speed_kmh: number | null; recorded_at: string; source: string }>(
    "select latitude, longitude, speed_kmh, recorded_at, source from vehicle_location_events where trip_id = $1 order by recorded_at desc limit 120",
    [tripId],
  );
  const alerts = await sql.many<{ id: string; alert_type: string; message: string; created_at: string; resolved_at: string | null }>(
    "select id, alert_type, message, created_at, resolved_at from transport_alerts where trip_id = $1 order by created_at desc limit 20",
    [tripId],
  );
  const events = await sql.many<{ student_id: string; event_type: string; recorded_at: string; stop_name: string | null }>(
    `select e.student_id, e.event_type, e.recorded_at, rs.name as stop_name from pickup_dropoff_events e
     left join route_stops rs on rs.id = e.stop_id where e.trip_id = $1 order by e.recorded_at desc`,
    [tripId],
  );
  const orderedStops: Stop[] = stops.map((s) => ({ id: s.id, name: s.name, order: s.stop_order, lat: s.latitude, lng: s.longitude, scheduledTime: trip.trip_type === "pickup" ? s.pickup_time : s.drop_time }));
  // Drop trips run from school outwards: reverse the stop order.
  const routeForTrip = trip.trip_type === "drop" ? [...orderedStops].reverse().map((s, i) => ({ ...s, order: i + 1 })) : orderedStops;
  const reached = reachedOrder(routeForTrip, fixes);
  const eta = trip.status === "in_progress"
    ? estimateArrivals(routeForTrip, fixes.map((f) => ({ lat: f.latitude, lng: f.longitude, recordedAt: f.recorded_at, speedKmh: f.speed_kmh })), reached)
    : null;
  return {
    trip,
    stops: routeForTrip,
    path: [...fixes].reverse().map((f) => [f.latitude, f.longitude] as [number, number]),
    lastFix: fixes[0] ?? null,
    connection: trip.status === "in_progress" ? connectionStatus(fixes[0]?.recorded_at ?? null) : "offline",
    eta,
    alerts,
    events,
  };
}

/** Furthest stop (in trip order) the vehicle has come within 150 m of, judged from all fixes so far. */
function reachedOrder(stops: Stop[], fixes: { latitude: number; longitude: number }[]) {
  let reached = 0;
  for (const f of [...fixes].reverse()) {
    for (const s of stops) {
      if (s.order > reached && Math.abs(s.lat - f.latitude) < 0.0015 && Math.abs(s.lng - f.longitude) < 0.0015) reached = s.order;
    }
  }
  return reached;
}

// ---------------------------------------------------------------- telemetry
export type TelemetryOutcome = { tripId: string; alerts: { type: string; message: string }[] };

/**
 * Stores one fix for a running trip and evaluates alerts. Authorization is
 * done by the caller (driver session with RLS, or a verified device token in
 * the trusted context). Rejects fixes for finished trips, stale or future
 * timestamps, and simulator data on real trips (and vice versa).
 */
export async function recordFix(sql: Sql, tripId: string, fix: TelemetryInput, source: "device" | "driver_app" | "simulator"): Promise<TelemetryOutcome> {
  const trip = await sql.maybeOne<{ id: string; school_id: string; vehicle_id: string | null; status: string; is_simulated: boolean; trip_type: string; route_id: string; trip_date: string }>(
    "select id, school_id, vehicle_id, status, is_simulated, trip_type, route_id, trip_date from transport_trips where id = $1",
    [tripId],
  );
  if (!trip) throw new AppError("Trip not found", "not_found");
  if (trip.status !== "in_progress") throw new AppError("This trip has ended.", "conflict");
  if ((source === "simulator") !== trip.is_simulated) throw new ForbiddenError("Simulated and real locations cannot be mixed on one trip.");
  const recordedAt = fix.recordedAt ? new Date(fix.recordedAt) : new Date();
  const now = Date.now();
  if (recordedAt.getTime() > now + 60_000) throw new AppError("Location timestamp is in the future.");
  if (recordedAt.getTime() < now - 6 * 3600_000) throw new AppError("Location is too old to accept.");

  await sql.exec(
    `insert into vehicle_location_events (school_id, vehicle_id, trip_id, latitude, longitude, speed_kmh, heading, accuracy_m, source, recorded_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [trip.school_id, trip.vehicle_id, trip.id, fix.latitude, fix.longitude, fix.speedKmh ?? null, fix.heading === undefined || fix.heading === null ? null : Math.round(fix.heading) % 360, fix.accuracyM ?? null, source, recordedAt.toISOString()],
  );
  await sql.exec("update transport_trips set last_location_at = greatest(coalesce(last_location_at, $2), $2) where id = $1", [trip.id, recordedAt.toISOString()]);
  return { tripId: trip.id, alerts: [] };
}

/**
 * Alert evaluation after a fix (trusted context): route deviation and delay
 * against the stop schedule. Each alert type is raised at most once every 15
 * minutes per trip. Returns new alerts so the caller can notify people.
 */
export async function evaluateTripAlerts(sql: Sql, tripId: string): Promise<{ type: string; message: string; schoolId: string; routeId: string; stopIds: string[] }[]> {
  const live = await liveTrip(sql, tripId);
  if (!live || !live.lastFix || live.trip.status !== "in_progress") return [];
  const raised: { type: string; message: string; schoolId: string; routeId: string; stopIds: string[] }[] = [];
  const recent = async (type: string) =>
    sql.maybeOne("select 1 from transport_alerts where trip_id = $1 and alert_type = $2 and created_at > now() - interval '15 minutes'", [tripId, type]);

  const off = distanceFromRouteMeters({ lat: live.lastFix.latitude, lng: live.lastFix.longitude }, live.stops);
  if (off > DEVIATION_THRESHOLD_M && !(await recent("route_deviation"))) {
    const message = `Vehicle is about ${Math.round(off / 100) / 10} km away from the planned route.`;
    await sql.exec("insert into transport_alerts (school_id, trip_id, alert_type, message) values ($1, $2, 'route_deviation', $3)", [live.trip.school_id, tripId, message]);
    raised.push({ type: "route_deviation", message, schoolId: live.trip.school_id, routeId: live.trip.route_id, stopIds: [] });
  }
  if (live.eta?.ok) {
    const late = live.eta.stops
      .map((s) => ({ s, scheduled: live.stops.find((x) => x.id === s.stopId)?.scheduledTime }))
      .filter((x) => x.scheduled)
      .map((x) => ({ ...x, delay: delayMinutes(x.s.etaIso, x.scheduled!, live.trip.trip_date) }))
      .filter((x) => x.delay >= 10);
    if (late.length && !(await recent("delay"))) {
      const message = `Running about ${late[0].delay} minutes late (next stop: ${late[0].s.name}).`;
      await sql.exec("insert into transport_alerts (school_id, trip_id, alert_type, message) values ($1, $2, 'delay', $3)", [live.trip.school_id, tripId, message]);
      raised.push({ type: "delay", message, schoolId: live.trip.school_id, routeId: live.trip.route_id, stopIds: late.map((l) => l.s.stopId) });
    }
  }
  return raised;
}

export async function recordStudentEvent(
  sql: Sql,
  ctx: { schoolId: string; userId: string },
  input: { tripId: string; studentId: string; eventType: "boarded" | "dropped" | "not_present"; latitude?: number | null; longitude?: number | null },
) {
  const a = await sql.maybeOne<{ stop_id: string }>(
    `select a.stop_id from student_transport_assignments a join transport_trips t on t.route_id = a.route_id
     where t.id = $1 and a.student_id = $2 and a.end_date is null`,
    [input.tripId, input.studentId],
  );
  if (!a) throw new AppError("This student is not assigned to this route.");
  await sql.exec(
    `insert into pickup_dropoff_events (school_id, trip_id, student_id, stop_id, event_type, recorded_by, latitude, longitude)
     values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (trip_id, student_id, event_type) do nothing`,
    [ctx.schoolId, input.tripId, input.studentId, a.stop_id, input.eventType, ctx.userId, input.latitude ?? null, input.longitude ?? null],
  );
}

export async function tripManifest(sql: Sql, tripId: string) {
  return sql.many<{ student_id: string; student_name: string; class_section: string; stop_id: string; stop_name: string; stop_order: number; guardian_name: string | null; guardian_phone: string | null; boarded_at: string | null; dropped_at: string | null; not_present: boolean }>(
    "select * from get_trip_manifest($1)",
    [tripId],
  );
}

/** Routes this driver is assigned to (driver role). */
export async function myDriverRoutes(sql: Sql, schoolId: string, userId: string) {
  return sql.many<{ id: string; name: string; code: string; vehicle: string | null; active_trip_id: string | null; active_trip_type: string | null }>(
    `select r.id, r.name, r.code, v.registration_no as vehicle,
            (select t.id from transport_trips t where t.route_id = r.id and t.status = 'in_progress' limit 1) as active_trip_id,
            (select t.trip_type from transport_trips t where t.route_id = r.id and t.status = 'in_progress' limit 1) as active_trip_type
     from transport_routes r join drivers d on d.id = r.driver_id join staff st on st.id = d.staff_id
     left join vehicles v on v.id = r.vehicle_id
     where r.school_id = $1 and st.user_id = $2 and r.status = 'active' order by r.code`,
    [schoolId, userId],
  );
}

export async function transportReport(sql: Sql, schoolId: string, from: string, to: string) {
  return sql.many<{ route: string; trips: number; simulated: number; avg_minutes: number | null; delays: number; deviations: number; boardings: number }>(
    `select r.code || ' · ' || r.name as route,
            count(t.id)::int as trips,
            count(t.id) filter (where t.is_simulated)::int as simulated,
            round(avg(extract(epoch from (t.ended_at - t.started_at)) / 60) filter (where t.ended_at is not null))::int as avg_minutes,
            (select count(*)::int from transport_alerts a join transport_trips x on x.id = a.trip_id where x.route_id = r.id and a.alert_type = 'delay' and x.trip_date between $2 and $3) as delays,
            (select count(*)::int from transport_alerts a join transport_trips x on x.id = a.trip_id where x.route_id = r.id and a.alert_type = 'route_deviation' and x.trip_date between $2 and $3) as deviations,
            (select count(*)::int from pickup_dropoff_events e join transport_trips x on x.id = e.trip_id where x.route_id = r.id and e.event_type = 'boarded' and x.trip_date between $2 and $3) as boardings
     from transport_routes r left join transport_trips t on t.route_id = r.id and t.trip_date between $2 and $3
     where r.school_id = $1 group by r.id, r.code, r.name order by r.code`,
    [schoolId, from, to],
  );
}
