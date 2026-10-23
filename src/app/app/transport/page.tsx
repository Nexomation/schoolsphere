import type { Metadata } from "next";
import Link from "next/link";
import { Bus, FlaskConical, MapPin, Route, TriangleAlert } from "lucide-react";
import type { SearchParams } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge, humanize } from "@/components/status-badge";
import { LiveTrip } from "@/components/transport/live-trip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UrlPicker } from "@/components/url-controls";
import { requirePageContext, type SchoolContext } from "@/lib/auth/context";
import { listRoutes, listTrips } from "@/lib/data/transport";
import { familyChildren, pickChild } from "@/lib/data/school";
import { connectionStatus } from "@/lib/domain/geo";
import { formatClockTime, formatDateTime, relativeTime } from "@/lib/domain/dates";
import { mapConfig } from "@/lib/map-config";

export const metadata: Metadata = { title: "Transport" };

export default async function TransportPage({ searchParams }: PageProps<"/app/transport">) {
  const ctx = await requirePageContext("transport.view");
  const sp = await searchParams;
  if (ctx.role === "parent") return <ParentTransport ctx={ctx} sp={sp} />;
  return <ManagerOverview ctx={ctx} />;
}

async function ManagerOverview({ ctx }: { ctx: SchoolContext }) {
  const d = await ctx.db(async (sql) => ({ routes: await listRoutes(sql, ctx.schoolId), active: await listTrips(sql, ctx.schoolId, { active: true }), recent: await listTrips(sql, ctx.schoolId, { active: false, limit: 8 }) }));
  const alerts = d.active.reduce((s, t) => s + t.open_alerts, 0);
  return (
    <>
      <PageHeader title="Transport" description="Live trips, routes and alerts. Live positions come from drivers' phones, GPS trackers, or the labelled development simulator." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active trips" value={d.active.length} icon={Bus} tone={d.active.length ? "info" : "default"} />
        <StatCard label="Open alerts" value={alerts} icon={TriangleAlert} tone={alerts ? "danger" : "success"} />
        <StatCard label="Routes" value={d.routes.length} icon={Route} href="/app/transport/routes" />
        <StatCard label="Students using transport" value={d.routes.reduce((s, r) => s + r.students, 0)} icon={MapPin} />
      </div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Trips in progress</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {d.active.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No trips are running. Drivers start trips from their phone; you can also start a simulated trip from the Simulator tab.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Driver / vehicle</TableHead>
                  <TableHead>Signal</TableHead>
                  <TableHead>Alerts</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.active.map((t) => {
                  const c = connectionStatus(t.last_location_at);
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <span className="font-medium">
                          {t.route_code} · {t.route_name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {humanize(t.trip_type)} trip · started {relativeTime(t.started_at)}
                        </span>
                        {t.is_simulated && (
                          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-warning">
                            <FlaskConical className="size-3" aria-hidden /> Simulated
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {t.driver ?? "—"}
                        <span className="block text-xs text-muted-foreground">{t.vehicle ?? "No vehicle"}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={c} label={c === "no_data" ? "No location yet" : humanize(c)} />
                      </TableCell>
                      <TableCell>{t.open_alerts ? <StatusBadge status="failed" tone="danger" label={`${t.open_alerts} open`} /> : "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/app/transport/trips/${t.id}`}>Track</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent trips</CardTitle>
          <CardDescription>Trip history is visible to transport staff only.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              {d.recent.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/app/transport/trips/${t.id}`} className="font-medium hover:text-primary hover:underline">
                      {t.route_code} · {humanize(t.trip_type)}
                    </Link>
                    {t.is_simulated && <StatusBadge status="sandbox" label="Simulated" className="ml-2" />}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(t.started_at)} – {t.ended_at ? formatDateTime(t.ended_at) : "…"}
                  </TableCell>
                </TableRow>
              ))}
              {d.recent.length === 0 && (
                <TableRow>
                  <TableCell className="py-6 text-center text-sm text-muted-foreground">No completed trips yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

async function ParentTransport({ ctx, sp }: { ctx: SchoolContext; sp: SearchParams }) {
  const d = await ctx.db(async (sql) => {
    const children = await familyChildren(sql, ctx.schoolId);
    const child = pickChild(children, sp.child);
    if (!child) return { children, child: null };
    const assignment = await sql.maybeOne<{ route_id: string; route_name: string; route_code: string; stop_id: string; stop_name: string; pickup_time: string | null; drop_time: string | null; uses_pickup: boolean; uses_drop: boolean; vehicle: string | null; driver: string | null }>(
      `select r.id as route_id, r.name as route_name, r.code as route_code, s.id as stop_id, s.name as stop_name, s.pickup_time, s.drop_time,
              a.uses_pickup, a.uses_drop, v.registration_no as vehicle, st.full_name as driver
       from student_transport_assignments a join transport_routes r on r.id = a.route_id join route_stops s on s.id = a.stop_id
       left join vehicles v on v.id = r.vehicle_id left join drivers d on d.id = r.driver_id left join staff st on st.id = d.staff_id
       where a.student_id = $1 and a.end_date is null`,
      [child.id],
    );
    const trip = assignment
      ? await sql.maybeOne<{ id: string; trip_type: string }>("select id, trip_type from transport_trips where route_id = $1 and status = 'in_progress' limit 1", [assignment.route_id])
      : null;
    const events = await sql.many<{ event_type: string; recorded_at: string }>(
      "select event_type, recorded_at from pickup_dropoff_events where student_id = $1 order by recorded_at desc limit 6",
      [child.id],
    );
    return { children, child, assignment, trip, events };
  });
  if (!d.child) return <EmptyState title="No linked children" />;
  const map = mapConfig();

  return (
    <>
      <PageHeader
        title="School transport"
        description={d.child.full_name}
        actions={d.children.length > 1 && <UrlPicker param="child" label="Child" value={d.child.id} options={d.children.map((c) => ({ value: c.id, label: c.full_name }))} />}
      />
      {!d.assignment ? (
        <EmptyState icon={Bus} title="Not using school transport" description="Contact the transport office to add a route and stop." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="grid content-start gap-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  {d.assignment.route_code} · {d.assignment.route_name}
                </CardTitle>
                <CardDescription>
                  {d.assignment.vehicle ?? "Vehicle not assigned"}
                  {d.assignment.driver && ` · Driver: ${d.assignment.driver}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                <p>
                  Stop: <strong>{d.assignment.stop_name}</strong>
                </p>
                {d.assignment.uses_pickup && <p>Morning pickup: {formatClockTime(d.assignment.pickup_time)}</p>}
                {d.assignment.uses_drop && <p>Afternoon drop: {formatClockTime(d.assignment.drop_time)}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recent pickups &amp; drop-offs</CardTitle>
              </CardHeader>
              <CardContent>
                {d.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events recorded yet.</p>
                ) : (
                  <ul className="grid gap-2 text-sm">
                    {d.events.map((e, i) => (
                      <li key={i} className="flex justify-between">
                        <span>{e.event_type === "boarded" ? "Boarded" : e.event_type === "dropped" ? "Dropped off" : "Not at stop"}</span>
                        <span className="text-muted-foreground">{formatDateTime(e.recorded_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-2">
            {d.trip ? (
              <LiveTrip tripId={d.trip.id} tileUrl={map.tileUrl} attribution={map.attribution} highlightStopId={d.assignment.stop_id} />
            ) : (
              <EmptyState icon={MapPin} title="No trip running right now" description="The live location appears here while the driver is on a trip on this route." />
            )}
          </div>
        </div>
      )}
    </>
  );
}
