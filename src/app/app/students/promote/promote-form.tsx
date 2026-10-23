"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActionRunner } from "@/components/form/use-action-form";
import { promoteStudentsAction } from "../actions";

export function PromoteForm({
  sections,
  students,
}: {
  sections: { value: string; label: string }[];
  students: { id: string; name: string; section_id: string; roll_no: number | null }[];
}) {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { run, pending } = useActionRunner();
  const inSection = useMemo(() => students.filter((s) => s.section_id === from), [students, from]);

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Card>
      <CardContent className="grid gap-5 pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="from-section">From section</Label>
            <Select
              value={from}
              onValueChange={(v) => {
                setFrom(v);
                setSelected(new Set(students.filter((s) => s.section_id === v).map((s) => s.id)));
              }}
            >
              <SelectTrigger id="from-section" className="w-full">
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="to-section">To section</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger id="to-section" className="w-full">
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                {sections
                  .filter((s) => s.value !== from)
                  .map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {from && (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              Students ({selected.size} of {inSection.length} selected)
            </legend>
            {inSection.length === 0 && <p className="text-sm text-muted-foreground">No active students in this section.</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {inSection.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                  <Checkbox checked={selected.has(s.id)} onCheckedChange={(v) => toggle(s.id, v === true)} />
                  <span className="tabular w-6 text-muted-foreground">{s.roll_no ?? ""}</span>
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex justify-end">
          <Button
            disabled={pending || !from || !to || selected.size === 0}
            onClick={() =>
              run(() => promoteStudentsAction({ fromSectionId: from, toSectionId: to, studentIds: [...selected] }), {
                onSuccess: () => {
                  router.push("/app/students");
                  router.refresh();
                },
              })
            }
          >
            Move {selected.size} student{selected.size === 1 ? "" : "s"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
