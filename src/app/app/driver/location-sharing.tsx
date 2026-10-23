"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, LocateOff } from "lucide-react";
import { relativeTime } from "@/lib/domain/dates";

export type SharedPosition = { lat: number; lng: number };

/**
 * Shares the phone's GPS position for the running trip: watchPosition, sent
 * to the telemetry API at most every 10 seconds. Works only over HTTPS (or
 * localhost) and while this screen stays open; the status line says so
 * honestly when location is unavailable.
 */
export function LocationSharing({ tripId, onPosition }: { tripId: string; onPosition?: (p: SharedPosition) => void }) {
  const [state, setState] = useState<"starting" | "sharing" | "denied" | "unsupported" | "error">(() =>
    typeof navigator !== "undefined" && !("geolocation" in navigator) ? "unsupported" : "starting",
  );
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const lastPost = useRef(0);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const watch = navigator.geolocation.watchPosition(
      async (pos) => {
        onPosition?.({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setState("sharing");
        if (Date.now() - lastPost.current < 10_000) return;
        lastPost.current = Date.now();
        const res = await fetch("/api/transport/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tripId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            speedKmh: pos.coords.speed === null ? null : Math.round(pos.coords.speed * 3.6 * 10) / 10,
            heading: pos.coords.heading,
            accuracyM: pos.coords.accuracy,
            recordedAt: new Date(pos.timestamp).toISOString(),
            source: "driver_app",
          }),
        }).catch(() => null);
        if (res?.ok) {
          setLastSent(new Date().toISOString());
          setMessage(null);
        } else {
          const j = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
          setMessage(j.error ?? "Could not reach the server; will retry.");
        }
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [tripId, onPosition]);

  const ok = state === "sharing";
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${ok ? "bg-success/5" : "bg-warning/10"}`} role="status">
      {ok ? <LocateFixed className="mt-0.5 size-5 text-success" aria-hidden /> : <LocateOff className="mt-0.5 size-5 text-warning" aria-hidden />}
      <div className="text-sm">
        <p className="font-medium">
          {state === "sharing" && "Sharing live location"}
          {state === "starting" && "Waiting for GPS…"}
          {state === "denied" && "Location permission denied"}
          {state === "unsupported" && "This device cannot share location"}
          {state === "error" && "GPS unavailable"}
        </p>
        <p className="text-xs text-muted-foreground">
          {ok && (lastSent ? `Last sent ${relativeTime(lastSent)}. Keep this screen open during the trip.` : "Sending first position…")}
          {state === "denied" && "Allow location access for this site in your browser settings so parents can see the van."}
          {(state === "error" || state === "unsupported") && "Parents will not see a live position for this trip."}
        </p>
        {message && <p className="text-xs text-destructive">{message}</p>}
      </div>
    </div>
  );
}
