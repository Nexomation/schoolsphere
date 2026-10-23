import Link from "next/link";
import { Bus, FileWarning, Route, TriangleAlert, Users } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { StatusBadge, humanize } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SchoolContext } from "@/lib/auth/context";
import { listDrivers, listRoutes, listTrips, listVehicles } from "@/lib/data/transport";
import { schoolToday } from "@/lib/data/school";
import { addDays, formatDate } from "@/lib/domain/dates";
import { connectionStatus } from "@/lib/domain/geo";

export async function TransportDashboard({ ctx }: { ctx: SchoolContext }) {
  const d = await ctx.db(async (sql) => ({
    today: await schoolToday(sql, ctx.schoolId),
    routes: await listRoutes(sql, ctx.schoolId),
    trips: await listTrips(sql, ctx.schoolId, { active: true }),
    vehicles: await listVehicles(sql, ctx.schoolId),
    drivers: await listDrivers(sql, ctx.schoolId),
    unassigned: (await sql.one<{ n: number }>(
      `select count(*)::int as n from student_transport_assignments a join transport_routes r on r.id = a.route_id where a.school_id = $1 and a.end_date is null and (r.vehicle_id is null or r.driver_id is null)`,
      [ctx.schoolId],
    )).n,
  }));
  const soon = addDays(d.today, 30);
  const expiring = [
    ...d.vehicles.flatMap((v) =>
      (["insurance_expiry", "fitness_expiry", "permit_expiry"] as const)
        .filter((k) => v[k] && v[k]! <= soon)
        .map((k) => ({ label: `${v.registration_no}: ${humanize(k.replace("_expiry", ""))}`, date: v[k]! })),
    ),
    ...d.drivers.filter((x) => x.license_expiry <= soon).map((x) => ({ label: `${x.name}: driving licence`, date: x.license_expiry })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const alerts = d.trips.reduce((s, t) => s + t.open_alerts, 0);

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active trips" value={d.trips.length} icon={Bus} href="/app/transport" />
        <StatCard label="Open alerts" value={alerts} icon={TriangleAlert} tone={alerts ? "danger" : "success"} href="/app/transport" />
        <StatCard label="Routes" value={d.routes.length} hint={`${d.routes.reduce((s, r) => s + r.students, 0)} students`} icon={Route} href="/app/transport/routes" />
        <StatCard label="Documents expiring (30 days)" value={expiring.length} icon={FileWarning} tone={expiring.length ? "warning" : "default"} href="/app/transport/fleet" />
      </div>
      {d.unassigned > 0 && <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">{d.unassigned} students are on routes without a vehicle or driver assigned.</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Trips running now</CardTitle>
          </CardHeader>
          <CardContent>
            {d.trips.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trips running.</p>
            ) : (
              <ul className="divide-y text-sm">
                {d.trips.map((t) => {
                  const c = connectionStatus(t.last_location_at);
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                      <span>
                        <span className="font-medium">
                          {t.route_code} · {humanize(t.trip_type)}
                        </span>
                        {t.is_simulated && <StatusBadge status="sandbox" label="Simulated" className="ml-2" />}
                        <span className="block text-xs text-muted-foreground">{t.driver ?? "No driver"}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge status={c} label={c === "no_data" ? "No location" : humanize(c)} />
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/app/transport/trips/${t.id}`}>Track</Link>
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Expiring documents</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {expiring.map((e) => (
                <li key={e.label} className="flex justify-between gap-2">
                  <span>{e.label}</span>
                  <StatusBadge status="due" tone={e.date < d.today ? "danger" : "warning"} label={formatDate(e.date)} />
                </li>
              ))}
              {expiring.length === 0 && <li className="text-muted-foreground">Nothing expires in the next 30 days.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" aria-hidden /> Routes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {d.routes.map((r) => (
              <li key={r.id} className="flex justify-between gap-2 py-2">
                <Link href={`/app/transport/routes/${r.id}`} className="hover:text-primary hover:underline">
                  {r.code} · {r.name}
                </Link>
                <span className="text-muted-foreground">
                  {r.students} students · {r.vehicle ?? "no vehicle"}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
