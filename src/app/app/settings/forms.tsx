"use client";

import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useWatch } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { CheckboxField, FormGrid, SelectField, SubmitButton, SwitchField, TextField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { safeAccent } from "@/lib/brand";
import { BOARDS, BOARD_LABELS, brandingInput, gradeScaleInput, policyInput, schoolProfileInput } from "@/lib/schemas/settings";
import { createGradeScaleAction, saveBrandingAction, savePolicyAction, saveProfileAction } from "./actions";

function useRefresh() {
  const router = useRouter();
  return () => router.refresh();
}

type Profile = {
  name: string;
  board: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  district: string | null;
  state: string;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  udise_code: string | null;
};

export function ProfileForm({ profile }: { profile: Profile }) {
  const { form, onSubmit, pending } = useActionForm({
    schema: schoolProfileInput,
    defaultValues: {
      name: profile.name,
      board: profile.board as (typeof BOARDS)[number],
      addressLine1: profile.address_line1 ?? "",
      addressLine2: profile.address_line2 ?? "",
      city: profile.city ?? "",
      district: profile.district ?? "",
      state: profile.state,
      pincode: profile.pincode ?? "",
      phone: profile.phone ?? "",
      email: profile.email ?? "",
      website: profile.website ?? "",
      udiseCode: profile.udise_code ?? "",
    },
    action: saveProfileAction,
    onSuccess: useRefresh(),
  });
  const c = form.control;
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormGrid>
        <TextField control={c} name="name" label="School name" required className="sm:col-span-2" />
        <SelectField control={c} name="board" label="Board" options={BOARDS.map((b) => ({ value: b, label: BOARD_LABELS[b] }))} />
        <TextField control={c} name="udiseCode" label="UDISE+ code" />
        <TextField control={c} name="addressLine1" label="Address line 1" />
        <TextField control={c} name="addressLine2" label="Address line 2" />
        <TextField control={c} name="city" label="City / town" />
        <TextField control={c} name="district" label="District" />
        <TextField control={c} name="state" label="State" required />
        <TextField control={c} name="pincode" label="PIN code" inputMode="numeric" />
        <TextField control={c} name="phone" label="Office phone" type="tel" />
        <TextField control={c} name="email" label="Office email" type="email" />
        <TextField control={c} name="website" label="Website" />
      </FormGrid>
      <SubmitButton pending={pending} size="default">
        Save profile
      </SubmitButton>
    </form>
  );
}

export function BrandingForm({ branding }: { branding: { appName?: string; primaryColor?: string; logoUrl?: string } }) {
  const { form, onSubmit, pending } = useActionForm({
    schema: brandingInput,
    defaultValues: { appName: branding.appName ?? "", primaryColor: branding.primaryColor ?? "", logoUrl: branding.logoUrl ?? "" },
    action: saveBrandingAction,
    onSuccess: useRefresh(),
  });
  const color = useWatch({ control: form.control, name: "primaryColor" }) as string | undefined;
  const usable = color ? safeAccent(color) : null;
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormGrid>
        <TextField control={form.control} name="appName" label="App name shown to your school" placeholder="SchoolSphere" />
        <div className="grid gap-1.5">
          <TextField control={form.control} name="primaryColor" label="Accent colour" placeholder="#4f46e5" />
          {color && /^#[0-9a-fA-F]{6}$/.test(color) && (
            <p className="flex items-center gap-2 text-xs">
              <span className="inline-block size-4 rounded" style={{ background: color }} aria-hidden />
              {usable ? "Readable with white text — will be used." : "Too light for white text (WCAG AA). The default colour will be used instead."}
            </p>
          )}
        </div>
        <TextField control={form.control} name="logoUrl" label="Logo URL (https)" className="sm:col-span-2" />
      </FormGrid>
      <SubmitButton pending={pending} size="default">
        Save branding
      </SubmitButton>
    </form>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function PolicyForm({ initial }: { initial: { workingWeekdays: number[]; lateCountsAsPresent: boolean; excusedHandling: "exclude" | "count_as_present"; lowAttendanceThreshold: number; attendanceEditWindowDays: number; absentPolicy: "absent_counts_as_zero" | "absent_excluded"; receiptPrefix: string } }) {
  const { form, onSubmit, pending } = useActionForm({ schema: policyInput, defaultValues: initial, action: savePolicyAction, onSuccess: useRefresh() });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Working days</legend>
        <Controller
          control={form.control}
          name="workingWeekdays"
          render={({ field, fieldState }) => (
            <>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d, i) => {
                  const day = i + 1;
                  const value = (field.value as number[]) ?? [];
                  return (
                    <label key={d} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm">
                      <Checkbox checked={value.includes(day)} onCheckedChange={(v) => field.onChange(v === true ? [...value, day] : value.filter((x) => x !== day))} />
                      {d}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Holidays on the calendar are excluded automatically.</p>
              {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
            </>
          )}
        />
      </fieldset>
      <SwitchField control={form.control} name="lateCountsAsPresent" label="Late arrival counts as attended" />
      <FormGrid>
        <SelectField control={form.control} name="excusedHandling" label="Excused absences" options={[{ value: "exclude", label: "Left out of the percentage" }, { value: "count_as_present", label: "Counted as attended" }]} />
        <TextField control={form.control} name="lowAttendanceThreshold" label="Low attendance alert below (%)" type="number" />
        <TextField control={form.control} name="attendanceEditWindowDays" label="Teachers can correct attendance for (days)" type="number" description="Older corrections need an administrator." />
        <SelectField control={form.control} name="absentPolicy" label="Absent in an exam subject" options={[{ value: "absent_counts_as_zero", label: "Counts as zero (subject not passed)" }, { value: "absent_excluded", label: "Excluded from total (result incomplete)" }]} />
        <TextField control={form.control} name="receiptPrefix" label="Receipt number prefix" description="Receipts look like PREFIX/2026-27/00001" />
      </FormGrid>
      <SubmitButton pending={pending} size="default">
        Save policies
      </SubmitButton>
    </form>
  );
}

export function GradeScaleForm() {
  const { form, onSubmit, pending } = useActionForm({
    schema: gradeScaleInput,
    defaultValues: {
      name: "",
      bands: [
        { minPercent: 80, grade: "A", gradePoint: "", remark: "Excellent" },
        { minPercent: 60, grade: "B", gradePoint: "", remark: "Good" },
        { minPercent: 35, grade: "C", gradePoint: "", remark: "Satisfactory" },
        { minPercent: 0, grade: "D", gradePoint: "", remark: "Needs improvement" },
      ],
      makeDefault: false,
    },
    action: createGradeScaleAction,
    resetOnSuccess: true,
    onSuccess: useRefresh(),
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "bands" });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField control={form.control} name="name" label="Scale name" required />
      <div className="grid gap-2">
        <div className="grid grid-cols-[5rem_4rem_4rem_1fr_auto] gap-2 text-xs text-muted-foreground">
          <span>From %</span>
          <span>Grade</span>
          <span>Points</span>
          <span>Remark</span>
          <span />
        </div>
        {fields.map((f, i) => (
          <div key={f.id} className="grid grid-cols-[5rem_4rem_4rem_1fr_auto] gap-2">
            <Input type="number" aria-label="Minimum percent" {...form.register(`bands.${i}.minPercent`)} className="h-8" />
            <Input aria-label="Grade" {...form.register(`bands.${i}.grade`)} className="h-8" />
            <Input type="number" aria-label="Grade points" {...form.register(`bands.${i}.gradePoint`)} className="h-8" />
            <Input aria-label="Remark" {...form.register(`bands.${i}.remark`)} className="h-8" />
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove band" disabled={fields.length <= 2} onClick={() => remove(i)}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => append({ minPercent: 0, grade: "", gradePoint: "", remark: "" })}>
          <Plus aria-hidden /> Add band
        </Button>
        <p className="text-xs text-muted-foreground">The lowest band must start at 0%.</p>
      </div>
      <CheckboxField control={form.control} name="makeDefault" label="Use as the default for new examinations" />
      <SubmitButton pending={pending} size="default">
        Create grade scale
      </SubmitButton>
    </form>
  );
}
