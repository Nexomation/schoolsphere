"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useActionRunner } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeSetupAction, presetSubjectsAction, quickClassesAction } from "./actions";

export function QuickClasses({ classes }: { classes: { name: string; grade: number }[] }) {
  const router = useRouter();
  const [grades, setGrades] = useState<number[]>(classes.filter((c) => c.grade >= 1 && c.grade <= 10).map((c) => c.grade));
  const [sections, setSections] = useState("2");
  const { run, pending } = useActionRunner();
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {classes.map((c) => (
          <label key={c.grade} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm">
            <Checkbox checked={grades.includes(c.grade)} onCheckedChange={(v) => setGrades((g) => (v === true ? [...g, c.grade] : g.filter((x) => x !== c.grade)))} />
            {c.name}
          </label>
        ))}
      </div>
      <div className="flex items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor="spc">Sections per class</Label>
          <Input id="spc" type="number" min={1} max={10} value={sections} onChange={(e) => setSections(e.target.value)} className="h-9 w-24" />
        </div>
        <Button disabled={pending || grades.length === 0} onClick={() => run(() => quickClassesAction({ grades, sectionsPerClass: sections }), { onSuccess: () => router.refresh() })}>
          Create classes and sections
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Sections are named A, B, C… You can rename or add more later in Classes &amp; subjects.</p>
    </div>
  );
}

export function PresetSubjects({ presets, existing }: { presets: { name: string; code: string }[]; existing: string[] }) {
  const router = useRouter();
  const [codes, setCodes] = useState<string[]>(["ENG", "TAM", "MAT", "SCI", "SOC"].filter((c) => !existing.includes(c)));
  const { run, pending } = useActionRunner();
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <label key={p.code} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm">
            <Checkbox disabled={existing.includes(p.code)} checked={existing.includes(p.code) || codes.includes(p.code)} onCheckedChange={(v) => setCodes((c) => (v === true ? [...c, p.code] : c.filter((x) => x !== p.code)))} />
            {p.name}
          </label>
        ))}
      </div>
      <Button className="w-fit" disabled={pending || codes.length === 0} onClick={() => run(() => presetSubjectsAction(codes), { onSuccess: () => router.refresh() })}>
        Add selected subjects
      </Button>
    </div>
  );
}

export function FinishSetup({ ready }: { ready: boolean }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  return (
    <Button size="lg" disabled={!ready || pending} onClick={() => run(completeSetupAction, { onSuccess: () => { router.push("/app"); router.refresh(); } })}>
      Finish setup
    </Button>
  );
}
