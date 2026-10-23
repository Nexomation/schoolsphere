"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";
import { z } from "zod";
import { requestPasswordResetAction } from "../actions";
import { SubmitButton, TextField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";

const schema = z.object({ email: z.email("Enter a valid email address") });

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const { form, onSubmit, pending } = useActionForm({
    schema,
    defaultValues: { email: "" },
    action: requestPasswordResetAction,
    onSuccess: () => setSent(true),
  });
  if (sent) {
    return (
      <div className="flex items-start gap-3 rounded-lg border bg-success/5 p-4 text-sm" role="status">
        <MailCheck className="mt-0.5 size-5 text-success" aria-hidden />
        <p>If an account exists for that email, a reset link is on its way. The link expires in 30 minutes.</p>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" required />
      <SubmitButton pending={pending} className="w-full">
        Send reset link
      </SubmitButton>
    </form>
  );
}
