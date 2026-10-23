"use client";

import { useRouter } from "next/navigation";
import { Controller, useFieldArray } from "react-hook-form";
import { FormGrid, SelectField, SubmitButton, TextField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { examInput } from "@/lib/schemas/exams";
import { createExamAction } from "./actions";

type Option = { value: string; label: string };

export function ExamForm({
  classes,
  terms,
  scales,
  subjects,
}: {
  classes: Option[];
  terms: Option[];
  scales: Option[];
  subjects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: examInput,
    defaultValues: {
      classId: "",
      termId: "",
      gradeScaleId: "",
      name: "",
      examType: "term",
      startDate: "",
      endDate: "",
      subjects: subjects.map((s) => ({ subjectId: s.id, include: true, maxMarks: 100, passMarks: 35, examDate: "" })),
    },
    action: createExamAction,
    onSuccess: (d) => router.push(`/app/exams/${d.id}`),
  });
  const { fields } = useFieldArray({ control: form.control, name: "subjects" });
  const subjectsError = form.formState.errors.subjects?.root?.message ?? form.formState.errors.subjects?.message;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Examination</CardTitle>
        </CardHeader>
        <CardContent>
          <FormGrid>
            <TextField control={form.control} name="name" label="Name" placeholder="Half-Yearly Examination" required />
            <SelectField
              control={form.control}
              name="examType"
              label="Type"
              options={[
                { value: "unit_test", label: "Unit test" },
                { value: "term", label: "Term examination" },
                { value: "annual", label: "Annual examination" },
                { value: "other", label: "Other" },
              ]}
            />
            <SelectField control={form.control} name="classId" label="Class" options={classes} required />
            <SelectField control={form.control} name="termId" label="Term" options={terms} allowNone noneLabel="No term" />
            <TextField control={form.control} name="startDate" label="Starts" type="date" />
            <TextField control={form.control} name="endDate" label="Ends" type="date" />
            <SelectField control={form.control} name="gradeScaleId" label="Grading scale" options={scales} allowNone noneLabel="School default" />
          </FormGrid>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Subjects and maximum marks</CardTitle>
          <CardDescription>Students below the pass mark in any subject do not pass the examination overall.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="hidden grid-cols-[1.5rem_1fr_6rem_6rem_9rem] gap-3 px-1 text-xs font-medium text-muted-foreground sm:grid">
            <span />
            <span>Subject</span>
            <span>Max</span>
            <span>Pass</span>
            <span>Date</span>
          </div>
          {fields.map((f, i) => {
            const name = subjects.find((s) => s.id === f.subjectId)?.name;
            const err = form.formState.errors.subjects?.[i];
            return (
              <div key={f.id} className="grid grid-cols-[1.5rem_1fr] items-center gap-3 rounded-lg border p-2 sm:grid-cols-[1.5rem_1fr_6rem_6rem_9rem]">
                <Controller
                  control={form.control}
                  name={`subjects.${i}.include`}
                  render={({ field }) => <Checkbox checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} aria-label={`Include ${name}`} />}
                />
                <span className="text-sm font-medium">{name}</span>
                <Input aria-label={`${name} maximum marks`} type="number" className="h-8" {...form.register(`subjects.${i}.maxMarks`)} />
                <Input aria-label={`${name} pass marks`} type="number" className="h-8" aria-invalid={!!err?.passMarks} {...form.register(`subjects.${i}.passMarks`)} />
                <Input aria-label={`${name} exam date`} type="date" className="h-8" {...form.register(`subjects.${i}.examDate`)} />
                {err?.passMarks && <p className="col-span-full text-xs text-destructive">{err.passMarks.message}</p>}
              </div>
            );
          })}
          {subjectsError && <p className="text-xs text-destructive">{subjectsError}</p>}
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>Schedule examination</SubmitButton>
      </div>
    </form>
  );
}
