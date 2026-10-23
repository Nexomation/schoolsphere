"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, MailPlus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { CheckboxField, FormGrid, SelectField, SubmitButton, TextareaField, TextField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { RELATIONSHIPS } from "@/lib/schemas/common";
import { linkGuardianInput, statusChangeInput } from "@/lib/schemas/students";
import { changeStudentStatusAction, inviteUserAction, linkGuardianAction } from "../actions";

export function AddGuardianDialog({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: linkGuardianInput,
    defaultValues: { studentId, fullName: "", relationship: "mother", phone: "", email: "", occupation: "", isPrimary: false, verify: true },
    action: linkGuardianAction,
    resetOnSuccess: true,
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus aria-hidden /> Add guardian
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link a guardian</DialogTitle>
          <DialogDescription>If a guardian with this mobile number already exists (for a sibling), the existing record is reused.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormGrid>
            <TextField control={form.control} name="fullName" label="Full name" required />
            <SelectField control={form.control} name="relationship" label="Relationship" options={RELATIONSHIPS.map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) }))} />
            <TextField control={form.control} name="phone" label="Mobile number" type="tel" required />
            <TextField control={form.control} name="email" label="Email" type="email" />
          </FormGrid>
          <CheckboxField control={form.control} name="isPrimary" label="Primary contact" />
          <CheckboxField control={form.control} name="verify" label="Identity verified by the school office" description="Only verified guardians can see this child in the app." />
          <SubmitButton pending={pending}>Link guardian</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InviteDialog({
  role,
  roleOptions,
  defaults,
  link,
  triggerLabel = "Invite to app",
}: {
  role: Role;
  /** When given, the inviter chooses the role (staff invitations). */
  roleOptions?: Role[];
  defaults: { email: string; fullName: string };
  link: { guardianId?: string; studentId?: string; staffId?: string };
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ link: string; emailed: boolean } | null>(null);
  const schema = z.object({ email: z.email("Enter a valid email"), fullName: z.string().trim().min(2, "Enter a name"), role: z.enum(ROLES) });
  const { form, onSubmit, pending } = useActionForm({
    schema,
    defaultValues: { ...defaults, role },
    action: (v) => inviteUserAction({ ...v, ...link }),
    onSuccess: (d) => setResult(d),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setResult(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <MailPlus aria-hidden /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite to the app</DialogTitle>
          <DialogDescription>The invitation link works once and expires in 7 days.</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="grid gap-3">
            <p className="text-sm">
              {result.emailed ? "The invitation was emailed. You can also share this link:" : "Email delivery is not configured, so share this link with them directly (for example on WhatsApp):"}
            </p>
            <div className="flex gap-2">
              <Input readOnly value={result.link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copy link"
                onClick={() => navigator.clipboard.writeText(result.link).then(() => toast.success("Link copied"))}
              >
                <Copy />
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <TextField control={form.control} name="fullName" label="Name" required />
            <TextField control={form.control} name="email" label="Email" type="email" required />
            {roleOptions && (
              <SelectField control={form.control} name="role" label="Role" options={roleOptions.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
            )}
            <SubmitButton pending={pending}>Create invitation</SubmitButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function StatusChangeDialog({ studentId, currentStatus, today }: { studentId: string; currentStatus: string; today: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: statusChangeInput,
    defaultValues: { studentId, status: currentStatus === "active" ? "transferred" : "active", effectiveDate: today, reason: "" },
    action: changeStudentStatusAction,
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Change status
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer, withdraw or re-activate</DialogTitle>
          <DialogDescription>Leaving students keep their history (attendance, marks, payments). Their transport assignment ends on the effective date.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <SelectField
            control={form.control}
            name="status"
            label="New status"
            options={[
              { value: "transferred", label: "Transferred (TC issued)" },
              { value: "withdrawn", label: "Withdrawn" },
              { value: "graduated", label: "Graduated" },
              { value: "active", label: "Active" },
            ]}
          />
          <TextField control={form.control} name="effectiveDate" label="Effective date" type="date" required />
          <TextareaField control={form.control} name="reason" label="Reason" required rows={2} description="Recorded in the audit log." />
          <SubmitButton pending={pending}>Update status</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
