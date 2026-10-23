import "server-only";
import { validateAllocations, type FeeLine } from "../domain/money";
import { pgArray } from "../db";
import type { Sql } from "../db/types";
import { AppError } from "../errors";

export type RecordPaymentInput = {
  schoolId: string;
  studentId: string;
  allocations: { lineId: string; amount: number }[];
  method: string;
  mode: "offline" | "gateway" | "sandbox";
  provider?: "razorpay" | "sandbox" | null;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
  referenceNo?: string | null;
  paidAt: string;
  recordedBy: string | null;
  idempotencyKey: string;
  notes?: string | null;
};

export type RecordedPayment = { id: string; receiptNo: string; amountPaise: number; duplicate: boolean };

/**
 * The single way money enters the ledger, used for counter receipts and for
 * verified gateway captures alike. Runs inside the caller's transaction:
 *  1. Idempotency: the same key (or provider payment id) returns the
 *     existing payment instead of charging twice.
 *  2. The fee lines are locked (SELECT ... FOR UPDATE) so two cashiers cannot
 *     both collect the last rupee of the same installment.
 *  3. Allocations are validated against current balances (no overpayment).
 *  4. A sequential receipt number is issued and the payment + allocations
 *     are inserted; database constraint triggers re-check the totals at commit.
 */
export async function recordPayment(sql: Sql, input: RecordPaymentInput): Promise<RecordedPayment> {
  const existing = await sql.maybeOne<{ id: string; receipt_no: string; amount_paise: number }>(
    `select id, receipt_no, amount_paise from payments
     where school_id = $1 and (idempotency_key = $2 or ($3::text is not null and provider = $4 and provider_payment_id = $3))`,
    [input.schoolId, input.idempotencyKey, input.providerPaymentId ?? null, input.provider ?? null],
  );
  if (existing) return { id: existing.id, receiptNo: existing.receipt_no, amountPaise: existing.amount_paise, duplicate: true };

  const ids = input.allocations.map((a) => a.lineId);
  const lines = await sql.many<{ id: string; student_id: string; academic_year_id: string; due_date: string; amount_paise: number; discount_paise: number }>(
    `select id, student_id, academic_year_id, due_date, amount_paise, discount_paise from student_fee_assignments
     where id = any($1::uuid[]) and school_id = $2 and status = 'active' for update`,
    [pgArray(ids), input.schoolId],
  );
  if (lines.length !== new Set(ids).size || lines.some((l) => l.student_id !== input.studentId)) {
    throw new AppError("One of the selected fee items is not payable for this student.");
  }
  const years = new Set(lines.map((l) => l.academic_year_id));
  if (years.size !== 1) throw new AppError("Record payments for one academic year at a time.");
  const paid = await sql.many<{ id: string; paid: number }>(
    `select a.student_fee_assignment_id as id, coalesce(sum(a.amount_paise), 0) as paid
     from payment_allocations a join payments p on p.id = a.payment_id and p.status = 'captured'
     where a.student_fee_assignment_id = any($1::uuid[]) group by a.student_fee_assignment_id`,
    [pgArray(ids)],
  );
  const feeLines: FeeLine[] = lines.map((l) => ({
    id: l.id,
    dueDate: l.due_date,
    amountPaise: l.amount_paise,
    discountPaise: l.discount_paise,
    paidPaise: paid.find((p) => p.id === l.id)?.paid ?? 0,
  }));
  let total: number;
  try {
    total = validateAllocations(input.allocations.map((a) => ({ feeLineId: a.lineId, amountPaise: a.amount })), feeLines);
  } catch (e) {
    throw new AppError((e as Error).message);
  }

  const yearId = lines[0].academic_year_id;
  const receipt = await sql.one<{ no: string }>("select public.next_receipt_no($1, $2) as no", [input.schoolId, yearId]);
  const payment = await sql.one<{ id: string }>(
    `insert into payments (school_id, student_id, academic_year_id, receipt_no, amount_paise, method, mode, status, provider,
       provider_order_id, provider_payment_id, reference_no, paid_at, recorded_by, idempotency_key, notes)
     values ($1, $2, $3, $4, $5, $6, $7, 'captured', $8, $9, $10, $11, $12, $13, $14, $15) returning id`,
    [
      input.schoolId, input.studentId, yearId, receipt.no, total, input.method, input.mode, input.provider ?? null,
      input.providerOrderId ?? null, input.providerPaymentId ?? null, input.referenceNo ?? null, input.paidAt,
      input.recordedBy, input.idempotencyKey, input.notes ?? null,
    ],
  );
  for (const a of input.allocations) {
    await sql.exec(
      "insert into payment_allocations (school_id, payment_id, student_fee_assignment_id, amount_paise) values ($1, $2, $3, $4)",
      [input.schoolId, payment.id, a.lineId, a.amount],
    );
  }
  return { id: payment.id, receiptNo: receipt.no, amountPaise: total, duplicate: false };
}
