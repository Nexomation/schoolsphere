"use client";

import { useRouter } from "next/navigation";
import { CheckboxField, FormGrid, SelectField, SubmitButton, TextareaField, TextField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";
import { calendarEventInput } from "@/lib/schemas/academics";
import { createEventAction } from "../academics/actions";

export function EventForm({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: calendarEventInput,
    defaultValues: { title: "", description: "", eventType: "event", startDate: defaultDate, endDate: defaultDate, notifyFamilies: false },
    action: createEventAction,
    resetOnSuccess: true,
    onSuccess: () => router.refresh(),
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField control={form.control} name="title" label="Title" required />
      <SelectField
        control={form.control}
        name="eventType"
        label="Type"
        options={[
          { value: "holiday", label: "Holiday (no attendance)" },
          { value: "exam", label: "Examination" },
          { value: "event", label: "School event" },
          { value: "ptm", label: "Parent–teacher meeting" },
          { value: "other", label: "Other" },
        ]}
      />
      <FormGrid>
        <TextField control={form.control} name="startDate" label="From" type="date" required />
        <TextField control={form.control} name="endDate" label="To" type="date" required />
      </FormGrid>
      <TextareaField control={form.control} name="description" label="Details" rows={2} />
      <CheckboxField control={form.control} name="notifyFamilies" label="Notify parents, students and teachers" />
      <SubmitButton pending={pending} size="default">
        Add to calendar
      </SubmitButton>
    </form>
  );
}
