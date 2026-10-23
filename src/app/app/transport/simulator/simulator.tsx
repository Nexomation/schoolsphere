"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Pause, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { LiveTrip } from "@/components/transport/live-trip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { haversineMeters } from "@/lib/domain/geo";
import { endTripAction, startTripAction } from "../actions";

type Route = { id: string; label: string; activeTripId: string | null; activeSimulated: boolean; stops: { lat: number; lng: number; order: number }[] };

/** Point at `meters` along a polyline. */
function along(points: { lat: number; lng: number }[], meters: number) {
  let left = meters;
  for (let i = 0; i < points.length - 1; i++) {
    const seg = haversineMeters(points[i], points[i + 1]);
    if (left <= seg) {
      const t = seg === 0 ? 0 : left / seg;
      return { lat: points[i].lat + (points[i + 1].lat - points[i].lat) * t, lng: points[i].lng + (points[i + 1].lng - points[i].lng) * t, done: false };
    }
    left -= seg;
  }
  return { ...points[points.length - 1], done: true };
}

export function Simulator({ routes, tileUrl, attribution }: { routes: Route[]; tileUrl: string; attribution: string }) {
  const router = useRouter();
  const [routeId, setRouteId] = useState(routes[0]?.id ?? "");
  const [tripType, setTripType] = useState<"pickup" | "drop">("pickup");
  const [speed, setSpeed] = useState("25");
  const [detour, setDetour] = useState(false);
  const [tripId, setTripId] = useState<string | null>(routes.find((r) => r.activeSimulated)?.activeTripId ?? null);
  const [running, setRunning] = useState(false);
  const distance = useRef(0);
  const route = routes.find((r) => r.id === routeId);

  useEffect(() => {
    if (!running || !tripId || !route) return;
    const points = (tripType === "drop" ? [...route.stops].reverse() : route.stops).map((s) => ({ lat: s.lat, lng: s.lng }));
    const kmh = Number(speed);
    const id = setInterval(async () => {
      distance.current += (kmh * 1000 * 3) / 3600; // 3-second steps
      const p = along(points, distance.current);
      // A detour pushes the van ~900 m north-east of the route to trigger a deviation alert.
      const lat = detour ? p.lat + 0.006 : p.lat;
      const lng = detour ? p.lng + 0.006 : p.lng;
      const res = await fetch("/api/transport/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, latitude: lat, longitude: lng, speedKmh: kmh, source: "simulator" }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(j.error ?? "Telemetry rejected");
        setRunning(false);
      }
      if (p.done) {
        setRunning(false);
        toast.success("Simulated vehicle reached the last stop");
      }
    }, 3000);
    return () => clearInterval(id);
  }, [running, tripId, route, tripType, speed, detour]);

  const start = async () => {
    const res = await startTripAction(routeId, tripType, true);
    if (!res.ok) return toast.error(res.error);
    distance.current = 0;
    setTripId(res.data.tripId);
    setRunning(true);
    router.refresh();
  };
  const stop = async () => {
    setRunning(false);
    if (tripId) {
      const res = await endTripAction(tripId);
      if (!res.ok) toast.error(res.error);
    }
    setTripId(null);
    router.refresh();
  };
  const blocked = route?.activeTripId && !route.activeSimulated;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="grid content-start gap-4 rounded-xl border-2 border-dashed border-warning/60 bg-card p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-warning">
          <FlaskConical className="size-4" aria-hidden /> Development simulator
        </p>
        <p className="text-xs text-muted-foreground">
          Moves a pretend vehicle along the route&apos;s stops and sends telemetry through the real API, marked as simulated. Families on the route see a “SIMULATED” banner. Never use it to represent a real vehicle.
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="sim-route">Route</Label>
          <Select value={routeId} onValueChange={setRouteId} disabled={!!tripId}>
            <SelectTrigger id="sim-route" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {routes.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="sim-type">Trip</Label>
            <Select value={tripType} onValueChange={(v) => setTripType(v as "pickup" | "drop")} disabled={!!tripId}>
              <SelectTrigger id="sim-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pickup">Morning pickup</SelectItem>
                <SelectItem value="drop">Afternoon drop</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sim-speed">Speed</Label>
            <Select value={speed} onValueChange={setSpeed}>
              <SelectTrigger id="sim-speed" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["15", "25", "40", "120"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s} km/h{s === "120" ? " (fast-forward)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <label className="flex items-center justify-between gap-2 text-sm">
          Inject a detour (tests deviation alerts)
          <Switch checked={detour} onCheckedChange={setDetour} />
        </label>
        {blocked && <p className="text-xs text-destructive">A real trip is running on this route; the simulator cannot be used on it.</p>}
        <div className="flex flex-wrap gap-2">
          {!tripId ? (
            <Button onClick={start} disabled={!route || route.stops.length < 2 || !!blocked}>
              <Play aria-hidden /> Start simulated trip
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setRunning((r) => !r)}>
                {running ? <Pause aria-hidden /> : <Play aria-hidden />}
                {running ? "Pause" : "Resume"}
              </Button>
              <Button variant="destructive" onClick={stop}>
                <Square aria-hidden /> End trip
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="lg:col-span-2">
        {tripId ? <LiveTrip tripId={tripId} tileUrl={tileUrl} attribution={attribution} pollMs={3000} /> : <p className="text-sm text-muted-foreground">Start a simulated trip to see it on the map.</p>}
      </div>
    </div>
  );
}
