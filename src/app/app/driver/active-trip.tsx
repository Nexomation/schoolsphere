"use client";

import { useCallback, useRef } from "react";
import { Square } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { Manifest } from "@/components/transport/manifest";
import { Button } from "@/components/ui/button";
import { endTripAction } from "../transport/actions";
import { LocationSharing, type SharedPosition } from "./location-sharing";

type ManifestRow = Parameters<typeof Manifest>[0]["rows"][number];

export function ActiveTrip({ tripId, tripType, manifest }: { tripId: string; tripType: "pickup" | "drop"; manifest: ManifestRow[] }) {
  const position = useRef<SharedPosition | null>(null);
  const onPosition = useCallback((p: SharedPosition) => {
    position.current = p;
  }, []);
  return (
    <div className="grid gap-4">
      <LocationSharing tripId={tripId} onPosition={onPosition} />
      <Manifest tripId={tripId} tripType={tripType} rows={manifest} active getPosition={() => position.current} />
      <ConfirmAction
        action={() => endTripAction(tripId)}
        title="End this trip?"
        description="Location sharing stops. Make sure every student has been marked."
        confirmLabel="End trip"
        variant="destructive"
        trigger={
          <Button size="lg" variant="destructive" className="w-full">
            <Square aria-hidden /> End trip
          </Button>
        }
      />
    </div>
  );
}
