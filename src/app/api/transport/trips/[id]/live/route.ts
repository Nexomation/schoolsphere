import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireActionContext } from "@/lib/auth/context";
import { liveTrip } from "@/lib/data/transport";
import { NotFoundError } from "@/lib/errors";

/**
 * Live trip state polled by maps every few seconds. Loaded with the caller's
 * RLS scope: families get data only while a trip on their child's route is
 * running; completed trip history is limited to transport staff.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/api/transport/trips/[id]/live">) {
  try {
    const ctx = await requireActionContext();
    const id = z.uuid().parse((await params).id);
    const live = await ctx.db((sql) => liveTrip(sql, id));
    if (!live) throw new NotFoundError();
    const family = ctx.role === "parent" || ctx.role === "student";
    return NextResponse.json(
      {
        trip: {
          id: live.trip.id,
          routeName: live.trip.route_name,
          tripType: live.trip.trip_type,
          status: live.trip.status,
          isSimulated: live.trip.is_simulated,
          vehicle: live.trip.vehicle,
          startedAt: live.trip.started_at,
        },
        connection: live.connection,
        lastFix: live.lastFix,
        // Families see the position and ETAs, not the full breadcrumb trail.
        path: family ? live.path.slice(-1) : live.path,
        stops: live.stops,
        eta: live.eta,
        alerts: family ? live.alerts.filter((a) => a.alert_type === "delay" && !a.resolved_at).slice(0, 1) : live.alerts,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
