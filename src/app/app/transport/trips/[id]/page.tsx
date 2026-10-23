import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { PageHeader } from "@/components/page-header";
import { humanize } from "@/components/status-badge";
import { LiveTrip } from "@/components/transport/live-trip";
import { Manifest } from "@/components/transport/manifest";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { liveTrip, tripManifest } from "@/lib/data/transport";
import { formatDateTime } from "@/lib/domain/dates";
import { mapConfig } from "@/lib/map-config";
import { endTripAction } from "../../actions";

export const metadata: Metadata = { title: "Trip" };

export default async function TripPage({ params }: PageProps<"/app/transport/trips/[id]">) {
  const ctx = await requirePageContext("transport.manage");
  const { id } = await params;
  const d = await ctx.db(async (sql) => {
    const live = await liveTrip(sql, id).catch(() => null);
    if (!live) return null;
    return { live, manifest: await tripManifest(sql, id) };
  });
  if (!d) notFound();
  const t = d.live.trip;
  const map = mapConfig();
  const active = t.status === "in_progress";

  return (
    <>
      <PageHeader
        title={`${t.route_code} · ${humanize(t.trip_type)} trip`}
        description={`${t.route_name} · ${t.vehicle ?? "No vehicle"} · ${t.driver ?? "No driver"} · started ${formatDateTime(t.started_at)}${t.ended_at ? ` · ended ${formatDateTime(t.ended_at)}` : ""}`}
        back={{ href: "/app/transport", label: "Transport" }}
        actions={active && <ConfirmAction action={endTripAction.bind(null, t.id)} title="End this trip?" description="Location sharing stops and families no longer see the live position." confirmLabel="End trip" variant="destructive" />}
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <LiveTrip tripId={t.id} tileUrl={map.tileUrl} attribution={map.attribution} />
        </div>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Manifest ({d.manifest.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Manifest tripId={t.id} tripType={t.trip_type as "pickup" | "drop"} rows={d.manifest} active={active} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
