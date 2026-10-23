"use client";

import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useWatch } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { CheckboxField, SelectField, SubmitButton, TextField, TextareaField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR, paiseToRupeeString, rupeesToPaise, splitIntoInstallments } from "@/lib/domain/money";
import { feeCategoryInput, feeStructureInput } from "@/lib/schemas/fees";
import { createCategoryAction, createStructureAction } from "../actions";

function safePaise(v: unknown) {
  try {
    return rupeesToPaise(String(v ?? ""));
  } catch {
    return 0;
  }
}

export function StructureForm({ classes, categories }: { classes: { value: string; label: string }[]; categories: { value: string; label: string }[] }) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: feeStructureInput,
    defaultValues: {
      classIds: [],
      feeCategoryId: "",
      total: "",
      installments: [{ label: "Term 1", dueDate: "", amount: "" }],
      assignToStudents: true,
    },
    action: createStructureAction,
    onSuccess: () => {
      form.reset();
      router.refresh();
    },
  });
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: "installments" });
  const total = useWatch({ control: form.control, name: "total" });
  const insts = useWatch({ control: form.control, name: "installments" });
  const sum = (insts ?? []).reduce((s: number, i: { amount?: unknown }) => s + safePaise(i?.amount), 0);
  const totalPaise = safePaise(total);

  const splitEvenly = () => {
    if (!totalPaise) return;
    const parts = splitIntoInstallments(totalPaise, fields.length);
    replace(fields.map((f, i) => ({ label: insts?.[i]?.label ?? `Term ${i + 1}`, dueDate: insts?.[i]?.dueDate ?? "", amount: paiseToRupeeString(parts[i]) })));
  };
  const instErr = form.formState.errors.installments;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Classes</legend>
        <Controller
          control={form.control}
          name="classIds"
          render={({ field, fieldState }) => (
            <>
              <div className="flex flex-wrap gap-2">
                {classes.map((c) => {
                  const checked = (field.value as string[]).includes(c.value);
                  return (
                    <label key={c.value} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => field.onChange(v === true ? [...(field.value as string[]), c.value] : (field.value as string[]).filter((x) => x !== c.value))}
                      />
                      {c.label}
                    </label>
                  );
                })}
              </div>
              {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
            </>
          )}
        />
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField control={form.control} name="feeCategoryId" label="Fee category" options={categories} required />
        <TextField control={form.control} name="total" label="Total for the year (₹)" inputMode="decimal" required />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Installments</Label>
          <Button type="button" variant="ghost" size="sm" onClick={splitEvenly}>
            Split total evenly
          </Button>
        </div>
        {fields.map((f, i) => (
          <div key={f.id} className="grid grid-cols-[1fr_9rem_8rem_auto] items-start gap-2">
            <Input aria-label="Installment label" {...form.register(`installments.${i}.label`)} className="h-9" />
            <Input aria-label="Due date" type="date" {...form.register(`installments.${i}.dueDate`)} className="h-9" />
            <Input aria-label="Amount" inputMode="decimal" {...form.register(`installments.${i}.amount`)} className="h-9 text-right tabular" />
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove installment" disabled={fields.length === 1} onClick={() => remove(i)}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between text-sm">
          <Button type="button" variant="outline" size="sm" onClick={() => append({ label: `Term ${fields.length + 1}`, dueDate: "", amount: "" })} disabled={fields.length >= 12}>
            <Plus aria-hidden /> Add installment
          </Button>
          <span className={sum === totalPaise ? "text-success" : "text-destructive"}>
            {formatINR(sum)} of {formatINR(totalPaise)}
          </span>
        </div>
        {(instErr?.root?.message || instErr?.message) && <p className="text-xs text-destructive">{instErr?.root?.message ?? instErr?.message}</p>}
      </div>
      <CheckboxField control={form.control} name="assignToStudents" label="Bill every student currently enrolled in these classes" description="New admissions can be billed later from the structure list." />
      <SubmitButton pending={pending}>Save fee structure</SubmitButton>
    </form>
  );
}

export function CategoryForm() {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: feeCategoryInput,
    defaultValues: { name: "", description: "" },
    action: createCategoryAction,
    resetOnSuccess: true,
    onSuccess: () => router.refresh(),
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3">
      <TextField control={form.control} name="name" label="Category name" placeholder="Exam fee" required />
      <TextareaField control={form.control} name="description" label="Description" rows={2} />
      <SubmitButton pending={pending} size="default">
        Add category
      </SubmitButton>
    </form>
  );
}
