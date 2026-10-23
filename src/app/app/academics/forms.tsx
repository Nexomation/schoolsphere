"use client";

import { useRouter } from "next/navigation";
import { CheckboxField, FormGrid, SelectField, SubmitButton, TextField } from "@/components/form/fields";
import { useActionForm, useActionRunner } from "@/components/form/use-action-form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { academicYearInput, classInput, sectionInput, subjectInput, teacherAssignmentInput } from "@/lib/schemas/academics";
import { createAssignmentAction, createClassAction, createSectionAction, createSubjectAction, createYearAction, setClassTeacherAction } from "./actions";

type Option = { value: string; label: string };

function useRefresh() {
  const router = useRouter();
  return () => router.refresh();
}

export function YearForm() {
  const refresh = useRefresh();
  const { form, onSubmit, pending } = useActionForm({
    schema: academicYearInput,
    defaultValues: { name: "", startDate: "", endDate: "", makeCurrent: false, termCount: 3 },
    action: createYearAction,
    resetOnSuccess: true,
    onSuccess: refresh,
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormGrid>
        <TextField control={form.control} name="name" label="Name" placeholder="2027-28" required />
        <TextField control={form.control} name="termCount" label="Number of terms" type="number" min="1" max="4" />
        <TextField control={form.control} name="startDate" label="Starts" type="date" required />
        <TextField control={form.control} name="endDate" label="Ends" type="date" required />
      </FormGrid>
      <CheckboxField control={form.control} name="makeCurrent" label="Make this the current academic year" description="Dashboards, attendance and fees use the current year." />
      <SubmitButton pending={pending} size="default">
        Add academic year
      </SubmitButton>
    </form>
  );
}

export function ClassForm() {
  const refresh = useRefresh();
  const { form, onSubmit, pending } = useActionForm({
    schema: classInput,
    defaultValues: { name: "", gradeLevel: "" as unknown as number },
    action: createClassAction,
    resetOnSuccess: true,
    onSuccess: refresh,
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
      <TextField control={form.control} name="name" label="Class name" placeholder="Class 9" required />
      <TextField control={form.control} name="gradeLevel" label="Grade" type="number" min="-2" max="12" description="LKG -1, UKG 0" />
      <SubmitButton pending={pending} size="default">
        Add class
      </SubmitButton>
    </form>
  );
}

export function SectionForm({ classes, staff }: { classes: Option[]; staff: Option[] }) {
  const refresh = useRefresh();
  const { form, onSubmit, pending } = useActionForm({
    schema: sectionInput,
    defaultValues: { classId: "", name: "", classTeacherId: "", room: "", capacity: "" },
    action: createSectionAction,
    resetOnSuccess: true,
    onSuccess: refresh,
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormGrid>
        <SelectField control={form.control} name="classId" label="Class" options={classes} required />
        <TextField control={form.control} name="name" label="Section" placeholder="A" required />
        <SelectField control={form.control} name="classTeacherId" label="Class teacher" options={staff} allowNone noneLabel="Not assigned" />
        <TextField control={form.control} name="room" label="Room" />
      </FormGrid>
      <SubmitButton pending={pending} size="default">
        Add section to current year
      </SubmitButton>
    </form>
  );
}

export function SubjectForm() {
  const refresh = useRefresh();
  const { form, onSubmit, pending } = useActionForm({
    schema: subjectInput,
    defaultValues: { name: "", code: "" },
    action: createSubjectAction,
    resetOnSuccess: true,
    onSuccess: refresh,
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
      <TextField control={form.control} name="name" label="Subject" placeholder="Hindi" required />
      <TextField control={form.control} name="code" label="Code" placeholder="HIN" required />
      <SubmitButton pending={pending} size="default">
        Add subject
      </SubmitButton>
    </form>
  );
}

export function AssignmentForm({ staff, sections, subjects }: { staff: Option[]; sections: Option[]; subjects: Option[] }) {
  const refresh = useRefresh();
  const { form, onSubmit, pending } = useActionForm({
    schema: teacherAssignmentInput,
    defaultValues: { staffId: "", sectionId: "", subjectId: "" },
    action: createAssignmentAction,
    onSuccess: refresh,
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
      <SelectField control={form.control} name="staffId" label="Teacher" options={staff} required />
      <SelectField control={form.control} name="sectionId" label="Section" options={sections} required />
      <SelectField control={form.control} name="subjectId" label="Subject" options={subjects} allowNone noneLabel="Whole section (all subjects)" />
      <SubmitButton pending={pending} size="default">
        Assign
      </SubmitButton>
    </form>
  );
}

export function ClassTeacherPicker({ sectionId, value, staff }: { sectionId: string; value: string | null; staff: Option[] }) {
  const refresh = useRefresh();
  const { run, pending } = useActionRunner();
  return (
    <Select
      value={value ?? "__none"}
      disabled={pending}
      onValueChange={(v) => run(() => setClassTeacherAction(sectionId, v === "__none" ? "" : v), { onSuccess: refresh })}
    >
      <SelectTrigger className="h-8 w-full sm:w-52" aria-label="Class teacher">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">No class teacher</SelectItem>
        {staff.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
