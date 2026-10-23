import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { listDrivers, listRoutes, listVehicles } from "@/lib/data/transport";
import { listStaff } from "@/lib/data/academics";
import { RouteDialog } from "../forms";

export const metadata: Metadata = { title: "Routes & stops" };

export default async function RoutesPage() {
  const ctx = await requirePageContext("transport.manage");
  const d = await ctx.db(async (sql) => ({
    routes: await listRoutes(sql, ctx.schoolId),
    vehicles: await listVehicles(sql, ctx.schoolId),
    drivers: await listDrivers(sql, ctx.schoolId),
    staff: (await listStaff(sql, ctx.schoolId)).filter((s) => s.status === "active" && s.staff_type === "transport"),
  }));
  const options = {
    vehicles: d.vehicles.map((v) => ({ value: v.id, label: `${v.registration_no} (${v.capacity} seats)` })),
    drivers: d.drivers.map((x) => ({ value: x.id, label: x.name })),
    staff: d.staff.map((s) => ({ value: s.id, label: s.full_name })),
  };
  return (
    <>
      <PageHeader title="Routes & stops" actions={<RouteDialog {...options} />} />
      {d.routes.length === 0 ? (
        <EmptyState title="No routes yet" description="Create a route, add its stops on the map, then assign students." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {d.routes.map((r) => (
            <Link key={r.id} href={`/app/transport/routes/${r.id}`} className="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {r.code} · {r.name}
                    {r.active_trip_id && <StatusBadge status="live" label="Trip running" />}
                  </CardTitle>
                  <CardDescription>
                    {r.vehicle ?? "No vehicle"} · {r.driver ?? "No driver"}
                    {r.attendant && ` · Attendant: ${r.attendant}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {r.stops} stops · {r.students} students
                  {r.capacity !== null && r.students > r.capacity && <span className="ml-2 text-destructive">over capacity ({r.capacity} seats)</span>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
