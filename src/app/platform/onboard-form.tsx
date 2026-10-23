"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { FormGrid, SelectField, SubmitButton, TextField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { BOARDS, BOARD_LABELS } from "@/lib/schemas/settings";
import { onboardSchoolAction } from "./actions";

const schema = z.object({
  name: z.string().trim().min(3, "Enter the school name"),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]([a-z0-9-]{1,58})[a-z0-9]$/, "3–60 lowercase letters, numbers or hyphens"),
  board: z.enum(BOARDS),
  city: z.string().trim().min(2, "Enter the city"),
  district: z.string().optional(),
  principalName: z.string().trim().min(2, "Enter the principal's name"),
  principalEmail: z.email("Enter a valid email"),
});

export function OnboardForm() {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const { form, onSubmit, pending } = useActionForm({
    schema,
    defaultValues: { name: "", slug: "", board: "MATRICULATION", city: "", district: "", principalName: "", principalEmail: "" },
    action: onboardSchoolAction,
    resetOnSuccess: true,
    onSuccess: (d) => {
      setLink(d.inviteLink);
      router.refresh();
    },
  });
  return (
    <div className="grid gap-4">
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <FormGrid>
          <TextField control={form.control} name="name" label="School name" required className="sm:col-span-2" />
          <TextField control={form.control} name="slug" label="Short name" required description="Used in receipts, e.g. st-marys-salem" />
          <SelectField control={form.control} name="board" label="Board" options={BOARDS.map((b) => ({ value: b, label: BOARD_LABELS[b] }))} />
          <TextField control={form.control} name="city" label="City" required />
          <TextField control={form.control} name="district" label="District" />
          <TextField control={form.control} name="principalName" label="Principal's name" required />
          <TextField control={form.control} name="principalEmail" label="Principal's email" type="email" required />
        </FormGrid>
        <SubmitButton pending={pending} size="default">
          Create school and invite principal
        </SubmitButton>
      </form>
      {link && (
        <div className="grid gap-2 rounded-lg border bg-success/5 p-3 text-sm">
          <p>Send this one-time invitation link to the principal (valid 14 days):</p>
          <div className="flex gap-2">
            <Input readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" size="icon" aria-label="Copy" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Copied"))}>
              <Copy />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
