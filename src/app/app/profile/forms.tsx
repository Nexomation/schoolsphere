"use client";

import { useRouter } from "next/navigation";
import { z } from "zod";
import { SelectField, SubmitButton, TextField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";
import { changePasswordAction, saveMyProfileAction } from "../settings/actions";

export function MyProfileForm({ profile }: { profile: { full_name: string; phone: string | null; preferred_language: "en" | "ta" } }) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: z.object({ fullName: z.string().trim().min(2, "Enter your name"), phone: z.string().optional(), preferredLanguage: z.enum(["en", "ta"]) }),
    defaultValues: { fullName: profile.full_name, phone: profile.phone ?? "", preferredLanguage: profile.preferred_language },
    action: saveMyProfileAction,
    onSuccess: () => router.refresh(),
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField control={form.control} name="fullName" label="Full name" required />
      <TextField control={form.control} name="phone" label="Mobile number" type="tel" />
      <SelectField
        control={form.control}
        name="preferredLanguage"
        label="Preferred language for messages"
        options={[{ value: "en", label: "English" }, { value: "ta", label: "தமிழ் (Tamil) — interface translation coming soon" }]}
      />
      <SubmitButton pending={pending} size="default">
        Save
      </SubmitButton>
    </form>
  );
}

export function ChangePasswordForm() {
  const { form, onSubmit, pending } = useActionForm({
    schema: z
      .object({ current: z.string().min(1, "Enter your current password"), password: z.string().min(10, "At least 10 characters").regex(/[A-Za-z]/, "Include a letter").regex(/[0-9]/, "Include a number"), confirm: z.string() })
      .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" }),
    defaultValues: { current: "", password: "", confirm: "" },
    action: changePasswordAction,
    resetOnSuccess: true,
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField control={form.control} name="current" label="Current password" type="password" autoComplete="current-password" required />
      <TextField control={form.control} name="password" label="New password" type="password" autoComplete="new-password" required />
      <TextField control={form.control} name="confirm" label="Confirm new password" type="password" autoComplete="new-password" required />
      <SubmitButton pending={pending} size="default">
        Change password
      </SubmitButton>
    </form>
  );
}
