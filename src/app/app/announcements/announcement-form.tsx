"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useWatch } from "react-hook-form";
import { CheckboxField, FormGrid, SelectField, SubmitButton, TextareaField, TextField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";
import { z } from "zod";
import { createAnnouncementAction } from "./actions";

const schema = z
  .object({
    title: z.string().trim().min(3, "Add a title").max(200),
    body: z.string().trim().min(1, "Write the announcement").max(10000),
    audience: z.enum(["all", "staff", "parents", "students", "section"]),
    sectionId: z.string().optional(),
    priority: z.enum(["normal", "important", "urgent"]),
    publish: z.boolean(),
    isAiAssisted: z.boolean(),
  })
  .refine((v) => v.audience !== "section" || !!v.sectionId, { path: ["sectionId"], message: "Choose the section" });

export function AnnouncementForm({ sections, teacherOnly }: { sections: { value: string; label: string }[]; teacherOnly: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  // The AI assistant can hand over a reviewed draft via ?draft=...
  const draft = params.get("draft");
  const { form, onSubmit, pending } = useActionForm({
    schema,
    defaultValues: {
      title: params.get("title") ?? "",
      body: draft ?? "",
      audience: teacherOnly ? "section" : "all",
      sectionId: "",
      priority: "normal",
      publish: true,
      isAiAssisted: !!draft,
    },
    action: createAnnouncementAction,
    resetOnSuccess: true,
    onSuccess: () => router.replace("/app/announcements"),
  });
  const audience = useWatch({ control: form.control, name: "audience" });
  const aiAssisted = useWatch({ control: form.control, name: "isAiAssisted" });
  const audiences = [
    { value: "all", label: "Everyone" },
    { value: "parents", label: "All parents" },
    { value: "students", label: "All students" },
    { value: "staff", label: "Staff only" },
    { value: "section", label: "One class section" },
  ].filter((a) => !teacherOnly || a.value === "section");

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {aiAssisted && <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">Drafted with the AI assistant. Read it carefully and edit before publishing — you are the author.</p>}
      <TextField control={form.control} name="title" label="Title" required />
      <TextareaField control={form.control} name="body" label="Message" rows={6} required />
      <FormGrid>
        <SelectField control={form.control} name="audience" label="Audience" options={audiences} />
        {audience === "section" && <SelectField control={form.control} name="sectionId" label="Section" options={sections} required />}
        <SelectField control={form.control} name="priority" label="Priority" options={[{ value: "normal", label: "Normal" }, { value: "important", label: "Important" }, { value: "urgent", label: "Urgent" }]} />
      </FormGrid>
      <CheckboxField control={form.control} name="publish" label="Publish now and notify the audience" description="Untick to save as a draft." />
      <SubmitButton pending={pending} size="default">
        Save
      </SubmitButton>
    </form>
  );
}
