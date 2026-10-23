"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { saveAttendanceAction } from "./actions";

type Status = "present" | "absent" | "late" | "excused";
type Row = { student_id: string; full_name: string; roll_no: number | null; status: Status | null; remarks: string | null };

const OPTIONS: { value: Status; short: string; label: string; active: string }[] = [
  { value: "present", short: "P", label: "Present", active: "bg-success text-success-foreground border-success" },
  { value: "absent", short: "A", label: "Absent", active: "bg-destructive text-white border-destructive" },
  { value: "late", short: "L", label: "Late", active: "bg-warning text-warning-foreground border-warning" },
  { value: "excused", short: "E", label: "Excused", active: "bg-info text-white border-info" },
];

export function AttendanceRegister({
  sectionId,
  subjectId,
  date,
  rows,
  requiresReason,
  readOnly,
}: {
  sectionId: string;
  subjectId: string | null;
  date: string;
  rows: Row[];
  requiresReason: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const existing = rows.some((r) => r.status);
  const [statuses, setStatuses] = useState<Record<string, Status>>(() =>
    Object.fromEntries(rows.map((r) => [r.student_id, r.status ?? "present"])),
  );
  const [remarks, setRemarks] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.student_id, r.remarks ?? ""])));
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const s of Object.values(statuses)) c[s]++;
    return c;
  }, [statuses]);

  const changed = rows.filter((r) => r.status !== statuses[r.student_id] || (r.remarks ?? "") !== (remarks[r.student_id] ?? "")).length;

  const save = () =>
    start(async () => {
      const res = await saveAttendanceAction({
        sectionId,
        subjectId: subjectId ?? "",
        date,
        correctionReason: reason || undefined,
        entries: rows.map((r) => ({ studentId: r.student_id, status: statuses[r.student_id], remarks: remarks[r.student_id] || undefined })),
      });
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {OPTIONS.map((o) => (
          <span key={o.value} className="rounded-md border px-2 py-1">
            {o.label}: <strong className="tabular">{counts[o.value]}</strong>
          </span>
        ))}
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setStatuses(Object.fromEntries(rows.map((r) => [r.student_id, "present" as Status])))}
          >
            <Check aria-hidden /> Mark all present
          </Button>
        )}
      </div>

      <ul className="divide-y rounded-xl border bg-card">
        {rows.map((r) => (
          <li key={r.student_id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="tabular w-7 text-right text-sm text-muted-foreground">{r.roll_no ?? "–"}</span>
              <span className="truncate font-medium">{r.full_name}</span>
            </div>
            <div role="radiogroup" aria-label={`Attendance for ${r.full_name}`} className="flex gap-1.5 pl-10 sm:pl-0">
              {OPTIONS.map((o) => {
                const active = statuses[r.student_id] === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={o.label}
                    title={o.label}
                    disabled={readOnly}
                    onClick={() => setStatuses((s) => ({ ...s, [r.student_id]: o.value }))}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg border text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
                      active ? o.active : "bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {o.short}
                  </button>
                );
              })}
            </div>
            {statuses[r.student_id] !== "present" && (
              <Input
                aria-label={`Remark for ${r.full_name}`}
                placeholder="Remark (optional)"
                value={remarks[r.student_id] ?? ""}
                disabled={readOnly}
                onChange={(e) => setRemarks((m) => ({ ...m, [r.student_id]: e.target.value }))}
                className="h-9 sm:w-56"
              />
            )}
          </li>
        ))}
      </ul>

      {!readOnly && (
        <div className="grid gap-3 rounded-xl border bg-card p-4">
          {existing && requiresReason && (
            <div className="grid gap-1.5">
              <Label htmlFor="reason">Reason for correction</Label>
              <Textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Student arrived after roll call; confirmed with gate register" />
              <p className="text-xs text-muted-foreground">Corrections to older attendance are recorded in the audit log with this reason.</p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {existing ? (changed ? `${changed} change${changed === 1 ? "" : "s"} not saved` : "Saved — no unsaved changes") : `${rows.length} students, not saved yet`}
            </p>
            <Button size="lg" onClick={save} disabled={pending || (existing && changed === 0) || (existing && requiresReason && reason.trim().length < 3)}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {existing ? "Save corrections" : "Save attendance"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
