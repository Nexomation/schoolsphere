"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { FlaskConical, Radio } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime, relativeTime } from "@/lib/domain/dates";
import type { MapStop } from "./leaflet-map";

const LeafletMap = dynamic(() => import("./leaflet-map"), { ssr: false, loading: () => <Skeleton className="h-[380px] w-full rounded-xl" /> });

type Live = {
  trip: { id: string; routeName: string; tripType: string; status: string; isSimulated: boolean; vehicle: string | null };
  connection: "live" | "delayed" | "offline" | "no_data";
  lastFix: { latitude: number; longitude: number; speed_kmh: number | null; recorded_at: string; source: string } | null;
  path: [number, number][];
  stops: { id: string; name: string; order: number; lat: number; lng: number; scheduledTime?: string | null }[];
  eta: { ok: true; speedKmh: number; stops: { stopId: string; name: string; etaIso: string; minutes: number }[] } | { ok: false; reason: string } | null;
  alerts: { id: string; alert_type: string; message: string; created_at: string; resolved_at: string | null }[];
};

const CONNECTION_LABEL = { live: "Live", delayed: "Signal delayed", offline: "No recent signal", no_data: "Waiting for first location" } as const;
const ETA_REASON: Record<string, string> = {
  no_fix: "No location received yet.",
  stale_fix: "No recent location, so no estimate is shown.",
  no_stops: "The route has no stops.",
  route_completed: "All stops have been reached.",
};

/**
 * Polls the live endpoint (Supabase Realtime can replace polling later; the
 * endpoint is the single source of truth either way). Stops polling when the
 * tab is hidden or the trip ends.
 */
export function LiveTrip({ tripId, tileUrl, attribution, highlightStopId, pollMs = 5000 }: { tripId: string; tileUrl: string; attribution: string; highlightStopId?: string; pollMs?: number }) {
  const [data, setData] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/transport/trips/${tripId}/live`, { cache: "no-store" });
          if (!res.ok) throw new Error(res.status === 404 ? "This trip is no longer visible." : "Could not load the live location.");
          const json = (await res.json()) as Live;
          if (!stopped) {
            setData(json);
            setError(null);
            if (json.trip.status !== "in_progress") stopped = true;
          }
        } catch (e) {
          if (!stopped) setError((e as Error).message);
        }
      }
      if (!stopped) timer = setTimeout(load, pollMs);
    };
    load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [tripId, pollMs]);

  if (error && !data) return <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>;
  if (!data) return <Skeleton className="h-[380px] w-full rounded-xl" />;

  const stops: MapStop[] = data.stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, order: s.order, highlight: s.id === highlightStopId }));
  const mine = data.eta?.ok && highlightStopId ? data.eta.stops.find((s) => s.stopId === highlightStopId) : null;

  return (
    <div className="grid gap-4">
      {data.trip.isSimulated && (
        <p className="flex items-center gap-2 rounded-lg bg-warning/10 p-2.5 text-sm font-medium text-warning">
          <FlaskConical className="size-4 shrink-0" aria-hidden /> SIMULATED trip — locations come from the development simulator, not a real vehicle.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={data.trip.status === "in_progress" ? data.connection : "completed"} label={data.trip.status === "in_progress" ? CONNECTION_LABEL[data.connection] : "Trip completed"} />
        {data.lastFix && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Radio className="size-3.5" aria-hidden /> Last update {relativeTime(data.lastFix.recorded_at)}
            {data.lastFix.speed_kmh !== null && ` · ${Math.round(data.lastFix.speed_kmh)} km/h`}
          </span>
        )}
      </div>
      {mine && (
        <div className="rounded-xl border bg-accent/50 p-4">
          <p className="text-sm text-muted-foreground">Estimated arrival at your stop ({mine.name})</p>
          <p className="text-2xl font-semibold tabular">
            {formatTime(mine.etaIso)} <span className="text-base font-normal text-muted-foreground">· about {mine.minutes} min</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Estimate from recent speed and the remaining route; traffic can change it.</p>
        </div>
      )}
      {data.alerts.filter((a) => !a.resolved_at).map((a) => (
        <p key={a.id} className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
          {a.message}
        </p>
      ))}
      <LeafletMap
        tileUrl={tileUrl}
        attribution={attribution}
        stops={stops}
        path={data.path}
        vehicle={data.lastFix ? { lat: data.lastFix.latitude, lng: data.lastFix.longitude, label: data.trip.vehicle ?? "Vehicle" } : null}
      />
      {data.eta && (
        <div className="rounded-xl border bg-card">
          <p className="border-b px-4 py-2 text-sm font-medium">Upcoming stops</p>
          {data.eta.ok ? (
            <ul className="divide-y text-sm">
              {data.eta.stops.map((s) => (
                <li key={s.stopId} className={`flex justify-between px-4 py-2 ${s.stopId === highlightStopId ? "bg-accent/50 font-medium" : ""}`}>
                  <span>{s.name}</span>
                  <span className="tabular">
                    {formatTime(s.etaIso)} <span className="text-muted-foreground">({s.minutes} min)</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">{ETA_REASON[data.eta.reason] ?? "No estimate available."}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function StaticRouteMap({ tileUrl, attribution, stops, onMapClick, height }: { tileUrl: string; attribution: string; stops: MapStop[]; onMapClick?: (lat: number, lng: number) => void; height?: number }) {
  return <LeafletMap tileUrl={tileUrl} attribution={attribution} stops={stops} onMapClick={onMapClick} height={height} />;
}
