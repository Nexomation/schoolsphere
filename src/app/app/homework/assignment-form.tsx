"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { CheckboxField, FormGrid, SelectField, SubmitButton, TextareaField, TextField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";
import { Card, CardContent } from "@/components/ui/card";
import { assignmentInput } from "@/lib/schemas/homework";
import { saveAssignmentAction } from "./actions";

type Section = { id: string; label: string; subjects: { id: string; name: string }[] };

export function AssignmentForm({
  sections,
  initial,
}: {
  sections: Section[];
  initial?: {
    id: string;
    sectionId: string;
    subjectId: string;
    title: string;
    description: string;
    dueAt: string;
    maxMarks: number | null;
    allowLate: boolean;
    status: string;
  };
}) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: assignmentInput,
    defaultValues: {
      id: initial?.id ?? "",
      sectionId: initial?.sectionId ?? sections[0]?.id ?? "",
      subjectId: initial?.subjectId ?? "",
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      dueAt: initial?.dueAt ?? "",
      maxMarks: initial?.maxMarks === null || initial?.maxMarks === undefined ? "" : String(initial.maxMarks),
      allowLate: initial?.allowLate ?? true,
      publish: initial ? initial.status !== "draft" : true,
      isAiAssisted: false,
    },
    action: saveAssignmentAction,
    onSuccess: (d) => {
      router.push(`/app/homework/${d.id}`);
      router.refresh();
    },
  });
  const sectionId = useWatch({ control: form.control, name: "sectionId" });
  const subjects = useMemo(() => sections.find((s) => s.id === sectionId)?.subjects ?? [], [sections, sectionId]);

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardContent className="grid gap-4 pt-6">
          <FormGrid>
            <SelectField control={form.control} name="sectionId" label="Section" options={sections.map((s) => ({ value: s.id, label: s.label }))} required />
            <SelectField control={form.control} name="subjectId" label="Subject" options={subjects.map((s) => ({ value: s.id, label: s.name }))} required />
          </FormGrid>
          <TextField control={form.control} name="title" label="Title" required placeholder="e.g. Exercise 4.1, questions 1–10" />
          <TextareaField control={form.control} name="description" label="Instructions" rows={6} description="Plain text. Attach worksheets after saving." />
          <FormGrid>
            <TextField control={form.control} name="dueAt" label="Due (IST)" type="datetime-local" required />
            <TextField control={form.control} name="maxMarks" label="Maximum marks" type="number" inputMode="decimal" description="Leave empty for ungraded work" />
          </FormGrid>
          <CheckboxField control={form.control} name="allowLate" label="Accept late submissions" description="Late work is flagged automatically." />
          <CheckboxField control={form.control} name="publish" label="Publish now" description="Students and parents are notified. Untick to save as a draft." />
          <div className="flex justify-end">
            <SubmitButton pending={pending}>{initial ? "Save changes" : "Save assignment"}</SubmitButton>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
