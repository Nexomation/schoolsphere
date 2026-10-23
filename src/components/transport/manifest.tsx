"use client";

import { useRouter } from "next/navigation";
import { Check, Phone, UserX } from "lucide-react";
import { useActionRunner } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/domain/dates";
import { studentEventAction } from "@/app/app/transport/actions";

type Row = { student_id: string; student_name: string; class_section: string; stop_id: string; stop_name: string; stop_order: number; guardian_name: string | null; guardian_phone: string | null; boarded_at: string | null; dropped_at: string | null; not_present: boolean };

/** Trip manifest with large tap targets for drivers and attendants. */
export function Manifest({ tripId, tripType, rows, active, getPosition }: { tripId: string; tripType: "pickup" | "drop"; rows: Row[]; active: boolean; getPosition?: () => { lat: number; lng: number } | null }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const record = (studentId: string, eventType: "boarded" | "dropped" | "not_present") => {
    const pos = getPosition?.() ?? null;
    run(() => studentEventAction({ tripId, studentId, eventType, latitude: pos?.lat ?? null, longitude: pos?.lng ?? null }), { onSuccess: () => router.refresh() });
  };
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">No students on this trip.</p>}
      {rows.map((r, i) => {
        const header = i === 0 || rows[i - 1].stop_name !== r.stop_name;
        const boarded = !!r.boarded_at;
        const dropped = !!r.dropped_at;
        return (
          <div key={r.student_id}>
            {header && (
              <div className="bg-muted/60 px-3 py-1.5 text-xs font-semibold">
                Stop {r.stop_order}: {r.stop_name}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2.5">
              <div className="min-w-40 flex-1">
                <p className="font-medium">{r.student_name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.class_section}
                  {boarded && ` · boarded ${formatTime(r.boarded_at)}`}
                  {dropped && ` · dropped ${formatTime(r.dropped_at)}`}
                  {r.not_present && " · not at stop"}
                </p>
              </div>
              {r.guardian_phone && (
                <Button asChild size="sm" variant="ghost" aria-label={`Call ${r.guardian_name ?? "guardian"}`}>
                  <a href={`tel:${r.guardian_phone}`}>
                    <Phone aria-hidden />
                  </a>
                </Button>
              )}
              {active && (
                <>
                  {!boarded && !r.not_present && tripType === "pickup" && (
                    <Button size="lg" disabled={pending} onClick={() => record(r.student_id, "boarded")}>
                      <Check aria-hidden /> Boarded
                    </Button>
                  )}
                  {tripType === "drop" && !boarded && (
                    <Button size="lg" variant="outline" disabled={pending} onClick={() => record(r.student_id, "boarded")}>
                      On board
                    </Button>
                  )}
                  {tripType === "drop" && boarded && !dropped && (
                    <Button size="lg" disabled={pending} onClick={() => record(r.student_id, "dropped")}>
                      <Check aria-hidden /> Dropped
                    </Button>
                  )}
                  {!boarded && !r.not_present && (
                    <Button size="lg" variant="ghost" disabled={pending} onClick={() => record(r.student_id, "not_present")} aria-label={`${r.student_name} not present`}>
                      <UserX aria-hidden />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
