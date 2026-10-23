/**
 * Geometry and ETA estimation for school transport.
 *
 * ETA model (deliberately simple and explainable):
 *  - The route is the ordered list of stops. The "next stop" is the first stop
 *    after the furthest stop the vehicle has already reached (within
 *    ARRIVAL_RADIUS_M), so the estimate never goes backwards along the route.
 *  - Remaining distance = straight-line distance to the next stop plus the
 *    stop-to-stop distances up to the target stop, multiplied by a road
 *    factor of 1.3 (roads are longer than straight lines).
 *  - Speed = average reported speed over recent fixes when it is at least
 *    8 km/h, otherwise a conservative urban default of 18 km/h.
 *  - Each intermediate stop adds one minute of dwell time.
 *  - No estimate is produced when the last fix is older than 5 minutes.
 */

export type LatLng = { lat: number; lng: number };
export type Stop = LatLng & { id: string; name: string; order: number; scheduledTime?: string | null };

export const ARRIVAL_RADIUS_M = 150;
export const DEVIATION_THRESHOLD_M = 600;
const ROAD_FACTOR = 1.3;
const DEFAULT_SPEED_KMH = 18;
const MIN_TRUSTED_SPEED_KMH = 8;
const DWELL_SECONDS = 60;

const EARTH_RADIUS_M = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance from point p to segment ab, using a local equirectangular projection (fine at city scale). */
export function distanceToSegmentMeters(p: LatLng, a: LatLng, b: LatLng): number {
  const latRef = toRad((a.lat + b.lat) / 2);
  const project = (q: LatLng) => ({ x: toRad(q.lng) * Math.cos(latRef) * EARTH_RADIUS_M, y: toRad(q.lat) * EARTH_RADIUS_M });
  const P = project(p);
  const A = project(a);
  const B = project(b);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2));
  return Math.hypot(P.x - (A.x + t * dx), P.y - (A.y + t * dy));
}

/** Shortest distance from the vehicle to the route polyline (through the ordered stops). */
export function distanceFromRouteMeters(p: LatLng, stops: Stop[]): number {
  const ordered = [...stops].sort((a, b) => a.order - b.order);
  if (ordered.length === 0) return Infinity;
  if (ordered.length === 1) return haversineMeters(p, ordered[0]);
  let best = Infinity;
  for (let i = 0; i < ordered.length - 1; i++) best = Math.min(best, distanceToSegmentMeters(p, ordered[i], ordered[i + 1]));
  return best;
}

export type ConnectionStatus = "live" | "delayed" | "offline" | "no_data";

export function connectionStatus(lastFixIso: string | null, now = new Date()): ConnectionStatus {
  if (!lastFixIso) return "no_data";
  const age = (now.getTime() - new Date(lastFixIso).getTime()) / 1000;
  if (age <= 60) return "live";
  if (age <= 300) return "delayed";
  return "offline";
}

export type Fix = LatLng & { recordedAt: string; speedKmh?: number | null };

export type StopEta = { stopId: string; name: string; order: number; etaIso: string; minutes: number; distanceM: number };

export type EtaResult =
  | { ok: true; nextStopIndex: number; speedKmh: number; stops: StopEta[] }
  | { ok: false; reason: "no_fix" | "stale_fix" | "no_stops" | "route_completed" };

/**
 * @param reachedOrder highest stop order already reached (from previous fixes
 *        or pickup/drop events); 0 when none.
 */
export function estimateArrivals(
  stopsInput: Stop[],
  fixes: Fix[],
  reachedOrder: number,
  now = new Date(),
): EtaResult {
  const stops = [...stopsInput].sort((a, b) => a.order - b.order);
  if (stops.length === 0) return { ok: false, reason: "no_stops" };
  const latest = [...fixes].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
  if (!latest) return { ok: false, reason: "no_fix" };
  if (connectionStatus(latest.recordedAt, now) === "offline") return { ok: false, reason: "stale_fix" };

  // Advance past any stop the vehicle is currently at.
  let reached = reachedOrder;
  for (const s of stops) {
    if (s.order > reached && haversineMeters(latest, s) <= ARRIVAL_RADIUS_M) reached = s.order;
  }
  const nextIndex = stops.findIndex((s) => s.order > reached);
  if (nextIndex === -1) return { ok: false, reason: "route_completed" };

  const recentSpeeds = fixes
    .filter((f) => typeof f.speedKmh === "number" && now.getTime() - new Date(f.recordedAt).getTime() <= 5 * 60_000)
    .map((f) => f.speedKmh as number);
  const avgSpeed = recentSpeeds.length ? recentSpeeds.reduce((a, b) => a + b, 0) / recentSpeeds.length : 0;
  const speedKmh = avgSpeed >= MIN_TRUSTED_SPEED_KMH ? avgSpeed : DEFAULT_SPEED_KMH;
  const metersPerSecond = (speedKmh * 1000) / 3600;

  const result: StopEta[] = [];
  let distance = haversineMeters(latest, stops[nextIndex]) * ROAD_FACTOR;
  let seconds = distance / metersPerSecond;
  for (let i = nextIndex; i < stops.length; i++) {
    if (i > nextIndex) {
      const leg = haversineMeters(stops[i - 1], stops[i]) * ROAD_FACTOR;
      distance += leg;
      seconds += leg / metersPerSecond + DWELL_SECONDS;
    }
    const eta = new Date(new Date(latest.recordedAt).getTime() + seconds * 1000);
    result.push({
      stopId: stops[i].id,
      name: stops[i].name,
      order: stops[i].order,
      etaIso: eta.toISOString(),
      minutes: Math.max(0, Math.round((eta.getTime() - now.getTime()) / 60_000)),
      distanceM: Math.round(distance),
    });
  }
  return { ok: true, nextStopIndex: nextIndex, speedKmh: Math.round(speedKmh), stops: result };
}

/** Minutes late versus the scheduled time ("HH:MM:SS", school-local) for a calendar date. */
export function delayMinutes(etaIso: string, scheduledTime: string, date: string, utcOffsetMinutes = 330): number {
  const [h, m] = scheduledTime.split(":").map(Number);
  const scheduledUtc = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    h,
    m,
  ) - utcOffsetMinutes * 60_000;
  return Math.round((new Date(etaIso).getTime() - scheduledUtc) / 60_000);
}
