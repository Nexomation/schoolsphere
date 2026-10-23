import Link from "next/link";
import { Bus, Navigation } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { humanize } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SchoolContext } from "@/lib/auth/context";
import { myDriverRoutes, routeStops } from "@/lib/data/transport";
import { formatClockTime } from "@/lib/domain/dates";

export async function DriverDashboard({ ctx }: { ctx: SchoolContext }) {
  const routes = await ctx.db(async (sql) =>
    Promise.all((await myDriverRoutes(sql, ctx.schoolId, ctx.userId)).map(async (r) => ({ ...r, stops: await routeStops(sql, r.id) }))),
  );
  if (routes.length === 0) return <EmptyState icon={Bus} title="No route assigned yet" description="The transport coordinator will assign your route." />;
  return (
    <div className="grid gap-4">
      {routes.map((r) => (
        <Card key={r.id}>
          <CardHeader>
            <CardTitle>
              {r.code} · {r.name}
            </CardTitle>
            <CardDescription>
              {r.vehicle ?? "No vehicle"} · {r.stops.length} stops · {r.stops.reduce((s, x) => s + x.students, 0)} students
              {r.active_trip_type && ` · ${humanize(r.active_trip_type)} trip in progress`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              First pickup {formatClockTime(r.stops[0]?.pickup_time)} at {r.stops[0]?.name ?? "—"}
            </p>
            <Button asChild size="lg" className="h-12">
              <Link href="/app/driver">
                <Navigation aria-hidden /> {r.active_trip_id ? "Continue trip" : "Open trip screen"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
