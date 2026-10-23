import type { Metadata } from "next";
import { Bus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { humanize } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { myDriverRoutes, routeStops, tripManifest } from "@/lib/data/transport";
import { formatClockTime } from "@/lib/domain/dates";
import { ActiveTrip } from "./active-trip";
import { StartTripButtons } from "./start-trip";

export const metadata: Metadata = { title: "My trips" };

export default async function DriverPage() {
  const ctx = await requirePageContext("transport.drive");
  const routes = await ctx.db(async (sql) => {
    const list = await myDriverRoutes(sql, ctx.schoolId, ctx.userId);
    return Promise.all(
      list.map(async (r) => ({
        ...r,
        stops: await routeStops(sql, r.id),
        manifest: r.active_trip_id ? await tripManifest(sql, r.active_trip_id) : [],
      })),
    );
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="My trips" description="Start a trip when you leave, mark each student, and end the trip at the last stop." />
      {routes.length === 0 && <EmptyState icon={Bus} title="No route assigned" description="Ask the transport coordinator to assign you to a route." />}
      <div className="grid gap-6">
        {routes.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle>
                {r.code} · {r.name}
              </CardTitle>
              <CardDescription>
                {r.vehicle ?? "No vehicle assigned"}
                {r.active_trip_type && ` · ${humanize(r.active_trip_type)} trip in progress`}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {r.active_trip_id ? (
                <ActiveTrip tripId={r.active_trip_id} tripType={r.active_trip_type as "pickup" | "drop"} manifest={r.manifest} />
              ) : (
                <>
                  <StartTripButtons routeId={r.id} />
                  <ol className="grid gap-1 text-sm">
                    {r.stops.map((s) => (
                      <li key={s.id} className="flex justify-between gap-2 rounded-md border px-3 py-2">
                        <span>
                          {s.stop_order}. {s.name} <span className="text-muted-foreground">({s.students})</span>
                        </span>
                        <span className="text-muted-foreground tabular">
                          {formatClockTime(s.pickup_time)} / {formatClockTime(s.drop_time)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
