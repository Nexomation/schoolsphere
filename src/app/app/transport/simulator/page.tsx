import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requirePageContext } from "@/lib/auth/context";
import { listRoutes, routeStops } from "@/lib/data/transport";
import { env } from "@/lib/env";
import { mapConfig } from "@/lib/map-config";
import { Simulator } from "./simulator";

export const metadata: Metadata = { title: "Location simulator" };

export default async function SimulatorPage() {
  const ctx = await requirePageContext("transport.manage");
  if (!env().TRANSPORT_SIMULATOR_ENABLED) notFound();
  const routes = await ctx.db(async (sql) => {
    const list = await listRoutes(sql, ctx.schoolId);
    const out = [];
    for (const r of list) {
      const active = r.active_trip_id ? await sql.maybeOne<{ is_simulated: boolean }>("select is_simulated from transport_trips where id = $1", [r.active_trip_id]) : null;
      out.push({
        id: r.id,
        label: `${r.code} · ${r.name}`,
        activeTripId: r.active_trip_id,
        activeSimulated: !!active?.is_simulated,
        stops: (await routeStops(sql, r.id)).map((s) => ({ lat: s.latitude, lng: s.longitude, order: s.stop_order })),
      });
    }
    return out;
  });
  const map = mapConfig();
  return (
    <>
      <PageHeader title="Location simulator" description="For development and demos only. Disable with TRANSPORT_SIMULATOR_ENABLED=false in production." />
      <Simulator routes={routes} tileUrl={map.tileUrl} attribution={map.attribution} />
    </>
  );
}
