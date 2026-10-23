"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserPlus } from "lucide-react";
import { FormGrid, SelectField, SubmitButton, TextField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { STAFF_TYPES, staffInput } from "@/lib/schemas/academics";
import { saveStaffAction } from "../academics/actions";

type Staff = {
  id: string;
  employee_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  designation: string;
  staff_type: string;
  date_of_joining: string | null;
  status: string;
};

export function StaffDialog({ staff, nextCode }: { staff?: Staff; nextCode?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: staffInput,
    defaultValues: {
      id: staff?.id ?? "",
      employeeCode: staff?.employee_code ?? nextCode ?? "",
      fullName: staff?.full_name ?? "",
      email: staff?.email ?? "",
      phone: staff?.phone ?? "",
      designation: staff?.designation ?? "Teacher",
      staffType: (staff?.staff_type ?? "teaching") as (typeof STAFF_TYPES)[number],
      dateOfJoining: staff?.date_of_joining ?? "",
      status: (staff?.status ?? "active") as "active",
    },
    action: saveStaffAction,
    resetOnSuccess: !staff,
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {staff ? (
          <Button size="icon-sm" variant="ghost" aria-label={`Edit ${staff.full_name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <UserPlus aria-hidden /> Add staff
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{staff ? `Edit ${staff.full_name}` : "Add a staff member"}</DialogTitle>
          <DialogDescription>Staff records are separate from app accounts. Invite them to give them a login.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormGrid>
            <TextField control={form.control} name="fullName" label="Full name" required />
            <TextField control={form.control} name="employeeCode" label="Employee code" required />
            <TextField control={form.control} name="designation" label="Designation" required />
            <SelectField
              control={form.control}
              name="staffType"
              label="Type"
              options={STAFF_TYPES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))}
            />
            <TextField control={form.control} name="email" label="Email" type="email" />
            <TextField control={form.control} name="phone" label="Phone" type="tel" />
            <TextField control={form.control} name="dateOfJoining" label="Date of joining" type="date" />
            {staff && (
              <SelectField
                control={form.control}
                name="status"
                label="Status"
                options={[
                  { value: "active", label: "Active" },
                  { value: "on_leave", label: "On leave" },
                  { value: "left", label: "Left the school (removes app access)" },
                ]}
              />
            )}
          </FormGrid>
          <SubmitButton pending={pending}>{staff ? "Save" : "Add staff member"}</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
