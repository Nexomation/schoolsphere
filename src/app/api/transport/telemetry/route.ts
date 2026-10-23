import { after, NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { getAuthContext } from "@/lib/auth/context";
import { hashToken } from "@/lib/auth/password";
import { can } from "@/lib/auth/permissions";
import { recordFix } from "@/lib/data/transport";
import { withService, withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError, ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { telemetryInput } from "@/lib/schemas/transport";
import { processTripAlerts } from "@/lib/transport-alerts";

// Per-sender throttle: at most one fix every 2 seconds (per server instance).
const lastSeen = new Map<string, number>();
function throttle(key: string) {
  const now = Date.now();
  if (now - (lastSeen.get(key) ?? 0) < 2000) throw new AppError("Too many location updates; send at most one every 2 seconds.", "conflict");
  lastSeen.set(key, now);
}

/**
 * GPS telemetry ingest.
 *
 * Two kinds of sender are accepted:
 *  - A hardware tracker: `Authorization: Bearer <device token>`. The token is
 *    looked up by its SHA-256 hash; the fix is attached to the running trip of
 *    the device's vehicle.
 *  - A signed-in driver's phone (session cookie), for their own running trip;
 *    or a transport coordinator driving the development simulator. These run
 *    with the user's RLS scope, so a driver cannot post to another route.
 *
 * Body: { tripId?, latitude, longitude, speedKmh?, heading?, accuracyM?, recordedAt?, source? }
 */
export async function POST(request: NextRequest) {
  try {
    const fix = telemetryInput.parse(await request.json());
    const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (bearer) {
      const result = await withService(async (sql) => {
        const device = await sql.maybeOne<{ id: string; vehicle_id: string }>(
          "update tracking_devices set last_seen_at = now() where token_hash = $1 and revoked_at is null returning id, vehicle_id",
          [hashToken(bearer)],
        );
        if (!device) throw new UnauthenticatedError("Unknown or revoked device token");
        throttle(`device:${device.id}`);
        const trip = await sql.maybeOne<{ id: string }>(
          "select id from transport_trips where vehicle_id = $1 and status = 'in_progress' and not is_simulated order by started_at desc limit 1",
          [device.vehicle_id],
        );
        if (!trip) return { accepted: false as const };
        if (fix.tripId && fix.tripId !== trip.id) throw new ForbiddenError("This device is not on that trip");
        return { accepted: true as const, ...(await recordFix(sql, trip.id, fix, "device")) };
      });
      if (result.accepted) after(() => processTripAlerts(result.tripId));
      // 202 without a trip: the device keeps reporting, but nothing is stored while no trip is running.
      return NextResponse.json(result, { status: result.accepted ? 201 : 202 });
    }

    const ctx = await getAuthContext();
    if (!ctx?.active) throw new UnauthenticatedError();
    if (!fix.tripId) throw new AppError("tripId is required");
    const source = fix.source === "simulator" ? "simulator" : "driver_app";
    if (source === "simulator") {
      if (!env().TRANSPORT_SIMULATOR_ENABLED) throw new ForbiddenError("The location simulator is disabled.");
      if (!can(ctx.active.role, "transport.manage")) throw new ForbiddenError();
    } else if (!can(ctx.active.role, "transport.drive")) {
      throw new ForbiddenError("Only the assigned driver can share live location.");
    }
    throttle(`user:${ctx.user.id}`);
    const result = await withUser({ userId: ctx.user.id }, (sql) => recordFix(sql, fix.tripId!, fix, source));
    after(() => processTripAlerts(result.tripId));
    return NextResponse.json({ accepted: true, ...result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
