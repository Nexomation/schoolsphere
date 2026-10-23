import { z } from "zod";
import { rupeesToPaise } from "../domain/money";
import { isoDate, optionalText, uuid } from "./common";

/** Rupee input ("12,500.50") -> integer paise. */
export const rupees = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    try {
      return rupeesToPaise(v);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: (e as Error).message });
      return z.NEVER;
    }
  });

export const positiveRupees = rupees.refine((v) => v > 0, "Enter an amount greater than zero");

export const feeCategoryInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: optionalText(300),
});

export const feeStructureInput = z
  .object({
    classIds: z.array(uuid).min(1, "Select at least one class"),
    feeCategoryId: uuid,
    total: positiveRupees,
    installments: z
      .array(z.object({ label: z.string().trim().min(1).max(40), dueDate: isoDate, amount: positiveRupees }))
      .min(1)
      .max(12),
    assignToStudents: z.boolean().default(true),
  })
  .refine((v) => v.installments.reduce((s, i) => s + i.amount, 0) === v.total, {
    path: ["installments"],
    message: "Installments must add up to the total",
  });

export const customFeeInput = z.object({
  studentId: uuid,
  feeCategoryId: uuid,
  description: z.string().trim().min(2).max(200),
  dueDate: isoDate,
  amount: positiveRupees,
});

export const discountInput = z
  .object({
    lineId: uuid,
    mode: z.enum(["amount", "percent"]),
    value: z.string().trim().min(1, "Enter a value"),
    discountType: z.enum(["sibling", "merit", "staff_ward", "scholarship", "financial_aid", "other"]),
    reason: z.string().trim().min(3, "Give a reason").max(300),
  });

export const PAYMENT_METHODS = ["cash", "upi", "cheque", "bank_transfer", "card", "netbanking"] as const;

export const offlinePaymentInput = z.object({
  studentId: uuid,
  idempotencyKey: z.uuid(),
  method: z.enum(PAYMENT_METHODS),
  referenceNo: optionalText(60),
  paidOn: isoDate,
  notes: optionalText(300),
  allocations: z
    .array(z.object({ lineId: uuid, amount: rupees }))
    .transform((a) => a.filter((x) => x.amount > 0))
    .refine((a) => a.length > 0, "Enter an amount against at least one fee item"),
});

export const voidPaymentInput = z.object({ paymentId: uuid, reason: z.string().trim().min(5, "Explain why the receipt is being voided").max(300) });

export const onlinePaymentInput = z.object({
  studentId: uuid,
  lineIds: z.array(uuid).min(1, "Select at least one fee item"),
});
