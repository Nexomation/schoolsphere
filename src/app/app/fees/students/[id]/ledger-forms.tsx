"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { FormGrid, SelectField, SubmitButton, TextareaField, TextField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/domain/dates";
import { allocateOldestFirst, formatINR, paiseToRupeeString, rupeesToPaise } from "@/lib/domain/money";
import { customFeeInput, discountInput, PAYMENT_METHODS } from "@/lib/schemas/fees";
import { addCustomFeeAction, applyDiscountAction, recordOfflinePaymentAction } from "../../actions";

type Line = { id: string; description: string; due_date: string; amount_paise: number; discount_paise: number; paid_paise: number; balance_paise: number };

const METHOD_LABEL: Record<string, string> = { cash: "Cash", upi: "UPI (reference)", cheque: "Cheque / DD", bank_transfer: "Bank transfer (NEFT/IMPS)", card: "Card (POS)", netbanking: "Net banking" };

export function RecordPaymentForm({ studentId, lines, today }: { studentId: string; lines: Line[]; today: string }) {
  const router = useRouter();
  const open = lines.filter((l) => l.balance_paise > 0);
  const totalDue = open.reduce((s, l) => s + l.balance_paise, 0);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [notes, setNotes] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();

  const { allocations, error } = (() => {
    if (!amount.trim()) return { allocations: [], error: null };
    try {
      const paise = rupeesToPaise(amount);
      const alloc = allocateOldestFirst(
        paise,
        open.map((l) => ({ id: l.id, dueDate: l.due_date, amountPaise: l.amount_paise, discountPaise: l.discount_paise, paidPaise: l.paid_paise })),
      );
      return { allocations: alloc, error: null };
    } catch (e) {
      return { allocations: [], error: (e as Error).message };
    }
  })();

  const submit = () =>
    start(async () => {
      const res = await recordOfflinePaymentAction({
        studentId,
        idempotencyKey: key,
        method,
        referenceNo: reference,
        paidOn,
        notes,
        allocations: allocations.map((a) => ({ lineId: a.feeLineId, amount: paiseToRupeeString(a.amountPaise) })),
      });
      if (res.ok) {
        toast.success(res.message);
        setKey(crypto.randomUUID());
        setAmount("");
        setReference("");
        router.push(`/app/fees/receipts/${res.data.paymentId}`);
      } else toast.error(res.error);
    });

  if (open.length === 0) return <p className="text-sm text-muted-foreground">Nothing is outstanding for this student.</p>;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="pay-amount">Amount received (₹)</Label>
          <div className="flex gap-2">
            <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" aria-invalid={!!error} className="h-9 tabular" />
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setAmount(paiseToRupeeString(totalDue))}>
              Full {formatINR(totalDue, { whole: true })}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pay-method">Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger id="pay-method" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {METHOD_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pay-ref">Reference no {method === "cash" ? "(optional)" : ""}</Label>
          <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === "cheque" ? "Cheque number" : method === "cash" ? "" : "UTR / transaction ID"} className="h-9" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pay-date">Date received</Label>
          <Input id="pay-date" type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="h-9" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pay-notes">Notes (optional)</Label>
        <Textarea id="pay-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {allocations.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="mb-1 font-medium">Applied to (oldest due first)</p>
          <ul className="grid gap-0.5">
            {allocations.map((a) => {
              const l = open.find((x) => x.id === a.feeLineId)!;
              return (
                <li key={a.feeLineId} className="flex justify-between gap-2">
                  <span>
                    {l.description} <span className="text-muted-foreground">(due {formatDate(l.due_date)})</span>
                  </span>
                  <span className="tabular">{formatINR(a.amountPaise)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="flex justify-end">
        <Button size="lg" onClick={submit} disabled={pending || allocations.length === 0}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Record payment & issue receipt
        </Button>
      </div>
    </div>
  );
}

export function DiscountDialog({ line }: { line: Line }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: discountInput,
    defaultValues: { lineId: line.id, mode: "percent", value: "", discountType: "sibling", reason: "" },
    action: applyDiscountAction,
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Discount on ${line.description}`} title="Discount / scholarship">
          <BadgePercent />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discount or scholarship</DialogTitle>
          <DialogDescription>
            {line.description}: {formatINR(line.amount_paise)}. Percentages are converted to rupees (rounded to the nearest paisa) and stored as a fixed amount. Enter 0 to remove.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormGrid>
            <SelectField control={form.control} name="mode" label="Type of value" options={[{ value: "percent", label: "Percentage" }, { value: "amount", label: "Amount (₹)" }]} />
            <TextField control={form.control} name="value" label="Value" inputMode="decimal" required />
            <SelectField
              control={form.control}
              name="discountType"
              label="Category"
              options={["sibling", "merit", "staff_ward", "scholarship", "financial_aid", "other"].map((t) => ({ value: t, label: t.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase()) }))}
            />
          </FormGrid>
          <TextareaField control={form.control} name="reason" label="Reason" rows={2} required description="Recorded with the fee item and in the audit log." />
          <SubmitButton pending={pending} size="default">
            Apply
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CustomFeeDialog({ studentId, categories, today }: { studentId: string; categories: { value: string; label: string }[]; today: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: customFeeInput,
    defaultValues: { studentId, feeCategoryId: "", description: "", dueDate: today, amount: "" },
    action: addCustomFeeAction,
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
          <Plus aria-hidden /> Add fee item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Student-specific fee</DialogTitle>
          <DialogDescription>For charges that apply only to this student, e.g. transport, a lost ID card or an excursion.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <SelectField control={form.control} name="feeCategoryId" label="Category" options={categories} required />
          <TextField control={form.control} name="description" label="Description" required />
          <FormGrid>
            <TextField control={form.control} name="amount" label="Amount (₹)" inputMode="decimal" required />
            <TextField control={form.control} name="dueDate" label="Due date" type="date" required />
          </FormGrid>
          <SubmitButton pending={pending} size="default">
            Add fee item
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
