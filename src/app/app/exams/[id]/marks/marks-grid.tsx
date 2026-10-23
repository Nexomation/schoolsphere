"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveMarksAction } from "../../actions";

type Row = { student_id: string; full_name: string; roll_no: number | null; section_label: string; marks_obtained: number | null; is_absent: boolean | null; remarks: string | null };

export function MarksGrid({ examSubjectId, maxMarks, passMarks, rows, published }: { examSubjectId: string; maxMarks: number; passMarks: number; rows: Row[]; published: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState(() =>
    Object.fromEntries(rows.map((r) => [r.student_id, { marks: r.marks_obtained === null ? "" : String(r.marks_obtained), absent: !!r.is_absent, remarks: r.remarks ?? "" }])),
  );
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    for (const [id, v] of Object.entries(values)) {
      if (v.absent || v.marks === "") continue;
      const n = Number(v.marks);
      if (!Number.isFinite(n) || n < 0) e[id] = "Invalid";
      else if (n > maxMarks) e[id] = `Max ${maxMarks}`;
      else if (Math.round(n * 100) !== n * 100) e[id] = "2 decimals max";
    }
    return e;
  }, [values, maxMarks]);
  const entered = Object.values(values).filter((v) => v.absent || v.marks !== "").length;

  const save = () =>
    start(async () => {
      const res = await saveMarksAction({
        examSubjectId,
        correctionReason: reason || undefined,
        entries: rows.map((r) => ({ studentId: r.student_id, absent: values[r.student_id].absent, marks: values[r.student_id].marks, remarks: values[r.student_id].remarks })),
      });
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });

  const set = (id: string, patch: Partial<(typeof values)[string]>) => setValues((v) => ({ ...v, [id]: { ...v[id], ...patch } }));

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Out of {maxMarks} · pass mark {passMarks} · {entered} of {rows.length} entered. Leave a box empty if the paper is not yet evaluated.
      </p>
      <div className="overflow-hidden rounded-xl border bg-card">
        {rows.map((r, i) => {
          const header = i === 0 || rows[i - 1].section_label !== r.section_label;
          const v = values[r.student_id];
          const n = Number(v.marks);
          const below = !v.absent && v.marks !== "" && Number.isFinite(n) && n < passMarks;
          return (
            <div key={r.student_id}>
              {header && <div className="bg-muted/60 px-3 py-1.5 text-xs font-semibold">{r.section_label}</div>}
              <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2">
                <span className="tabular w-7 text-right text-sm text-muted-foreground">{r.roll_no ?? "–"}</span>
                <span className="min-w-40 flex-1 font-medium">{r.full_name}</span>
                <div className="flex items-center gap-1.5">
                  <Input
                    aria-label={`Marks for ${r.full_name}`}
                    inputMode="decimal"
                    className={`h-9 w-24 text-right tabular ${below ? "text-destructive" : ""}`}
                    value={v.absent ? "" : v.marks}
                    disabled={v.absent}
                    aria-invalid={!!errors[r.student_id]}
                    tabIndex={i + 1}
                    onChange={(e) => set(r.student_id, { marks: e.target.value.trim() })}
                  />
                  <span className="text-xs text-muted-foreground">/ {maxMarks}</span>
                </div>
                <label className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={v.absent} onCheckedChange={(c) => set(r.student_id, { absent: c === true, marks: "" })} aria-label={`${r.full_name} absent`} />
                  Absent
                </label>
                {errors[r.student_id] && <span className="text-xs text-destructive">{errors[r.student_id]}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {published && (
        <div className="grid gap-1.5">
          <Label htmlFor="reason">Reason for correction</Label>
          <Textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Re-totalling after parent request" />
          <p className="text-xs text-muted-foreground">Results are already published; this correction is recorded in the audit log.</p>
        </div>
      )}
      <div className="flex justify-end">
        <Button size="lg" onClick={save} disabled={pending || Object.keys(errors).length > 0 || (published && reason.trim().length < 3)}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Save marks
        </Button>
      </div>
    </div>
  );
}
