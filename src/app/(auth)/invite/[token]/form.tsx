"use client";

import { useRouter } from "next/navigation";
import { z } from "zod";
import { acceptInvitationAction } from "../../actions";
import { acceptInvitationAsUserAction } from "./actions";
import { SubmitButton, TextField } from "@/components/form/fields";
import { useActionForm, useActionRunner } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your name"),
    password: z
      .string()
      .min(10, "At least 10 characters")
      .regex(/[A-Za-z]/, "Include a letter")
      .regex(/[0-9]/, "Include a number"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

export function AcceptInviteForm({ token, defaultName }: { token: string; defaultName: string }) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema,
    defaultValues: { fullName: defaultName, password: "", confirm: "" },
    action: (v) => acceptInvitationAction({ ...v, token }),
    onSuccess: (d) => {
      router.push(d.redirectTo);
      router.refresh();
    },
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <TextField control={form.control} name="fullName" label="Your full name" autoComplete="name" required />
      <TextField control={form.control} name="password" label="Password" type="password" autoComplete="new-password" required />
      <TextField control={form.control} name="confirm" label="Confirm password" type="password" autoComplete="new-password" required />
      <SubmitButton pending={pending} className="w-full">
        Create account and join
      </SubmitButton>
    </form>
  );
}

export function AcceptAsCurrentUser({ token }: { token: string }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  return (
    <Button
      className="w-full"
      size="lg"
      disabled={pending}
      onClick={() =>
        run(() => acceptInvitationAsUserAction(token), {
          onSuccess: () => {
            router.push("/app");
            router.refresh();
          },
        })
      }
    >
      Accept invitation
    </Button>
  );
}
