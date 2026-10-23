"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

export type MapStop = { id: string; name: string; lat: number; lng: number; order: number; highlight?: boolean };

const busIcon = L.divIcon({
  className: "",
  html: `<div style="background:var(--primary,#4f46e5);color:white;border:3px solid white;border-radius:9999px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35);font-size:16px" aria-hidden="true">🚌</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(L.latLngBounds(points).pad(0.15), { maxZoom: 15 });
    // fit once on first render only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function LeafletMap({
  tileUrl,
  attribution,
  stops,
  vehicle,
  path,
  onMapClick,
  height = 380,
}: {
  tileUrl: string;
  attribution: string;
  stops: MapStop[];
  vehicle?: { lat: number; lng: number; label: string } | null;
  path?: [number, number][];
  onMapClick?: (lat: number, lng: number) => void;
  height?: number;
}) {
  const points: [number, number][] = [...stops.map((s) => [s.lat, s.lng] as [number, number]), ...(vehicle ? [[vehicle.lat, vehicle.lng] as [number, number]] : [])];
  const center: [number, number] = points[0] ?? [11.0168, 76.9558];
  return (
    <div style={{ height }} className="overflow-hidden rounded-xl border">
      <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer url={tileUrl} attribution={attribution} />
        <FitBounds points={points} />
        {onMapClick && <ClickHandler onClick={onMapClick} />}
        {stops.length > 1 && <Polyline positions={stops.map((s) => [s.lat, s.lng])} pathOptions={{ color: "#94a3b8", weight: 3, dashArray: "6 6" }} />}
        {path && path.length > 1 && <Polyline positions={path} pathOptions={{ color: "#4f46e5", weight: 4 }} />}
        {stops.map((s) => (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lng]}
            radius={s.highlight ? 10 : 7}
            pathOptions={{ color: "white", weight: 2, fillColor: s.highlight ? "#0d9488" : "#4f46e5", fillOpacity: 1 }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              {s.order}. {s.name}
            </Tooltip>
          </CircleMarker>
        ))}
        {vehicle && (
          <Marker position={[vehicle.lat, vehicle.lng]} icon={busIcon}>
            <Tooltip direction="top" offset={[0, -16]} permanent>
              {vehicle.label}
            </Tooltip>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => onClick(Math.round(e.latlng.lat * 1e6) / 1e6, Math.round(e.latlng.lng * 1e6) / 1e6);
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [map, onClick]);
  return null;
}
