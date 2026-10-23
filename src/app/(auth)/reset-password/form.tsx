"use client";

import { useRouter } from "next/navigation";
import { z } from "zod";
import { completePasswordResetAction } from "../actions";
import { SubmitButton, TextField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";

const schema = z
  .object({
    password: z
      .string()
      .min(10, "At least 10 characters")
      .regex(/[A-Za-z]/, "Include a letter")
      .regex(/[0-9]/, "Include a number"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

export function ResetPasswordForm({ token }: { token?: string }) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema,
    defaultValues: { password: "", confirm: "" },
    action: (v) => completePasswordResetAction({ ...v, token }),
    onSuccess: () => router.push("/login"),
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <TextField control={form.control} name="password" label="New password" type="password" autoComplete="new-password" required />
      <TextField control={form.control} name="confirm" label="Confirm password" type="password" autoComplete="new-password" required />
      <SubmitButton pending={pending} className="w-full">
        Update password
      </SubmitButton>
    </form>
  );
}
