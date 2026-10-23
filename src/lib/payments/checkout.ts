import "server-only";
import { randomUUID } from "node:crypto";
import { pgArray, withService } from "../db";
import type { Sql } from "../db/types";
import { AppError } from "../errors";
import { logger } from "../logger";
import { familyUserIds, notifyUsers } from "../data/notifications";
import { formatINR } from "../domain/money";
import { providerByName, providerForSchool, type PaymentProvider } from "./provider";
import { recordPayment } from "./ledger";

/**
 * Parent checkout, step 1 (as the signed-in parent, RLS applies): validate the
 * selected fee lines belong to their child and are outstanding, then create a
 * provider order for the full outstanding amount of those lines.
 */
export async function createCheckout(sql: Sql, ctx: { schoolId: string; userId: string }, studentId: string, lineIds: string[]) {
  const school = await sql.one<{ is_demo: boolean }>("select is_demo from schools where id = $1", [ctx.schoolId]);
  const provider = providerForSchool(school);
  if (!provider) throw new AppError("Online payment is not set up for this school. Please pay at the school office.", "unavailable");
  const lines = await sql.many<{ id: string; balance_paise: number; description: string }>(
    `select id, balance_paise, description from student_fee_balances where student_id = $1 and id = any($2::uuid[]) and balance_paise > 0`,
    [studentId, pgArray(lineIds)],
  );
  if (lines.length !== new Set(lineIds).size) throw new AppError("Some selected fees are already paid or not available.");
  const amount = lines.reduce((s, l) => s + l.balance_paise, 0);
  const order = await provider.createOrder({ amountPaise: amount, receipt: `stu_${studentId.slice(0, 8)}_${Date.now()}`, notes: { school: ctx.schoolId, student: studentId } });
  const row = await sql.one<{ id: string }>(
    `insert into payment_orders (school_id, student_id, provider, provider_order_id, amount_paise, allocations, created_by)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7) returning id`,
    [ctx.schoolId, studentId, provider.name, order.providerOrderId, amount, JSON.stringify(lines.map((l) => ({ studentFeeAssignmentId: l.id, amountPaise: l.balance_paise }))), ctx.userId],
  );
  return { orderRowId: row.id, provider: provider.name, providerOrderId: order.providerOrderId, amountPaise: amount, keyId: provider.publicKey(), description: lines.map((l) => l.description).join(", ") };
}

/**
 * Step 2: capture after verification. Called from the signature-verify
 * endpoint and from the webhook; idempotent on the provider payment id, so a
 * webhook arriving after the browser callback (or twice) changes nothing.
 * Runs in the trusted context because gateway payments are written only by
 * the server (staff and parents cannot insert them, see RLS).
 */
export async function captureVerifiedPayment(input: {
  provider: PaymentProvider;
  providerOrderId: string;
  providerPaymentId: string;
  amountPaise?: number;
  method?: string;
}) {
  const result = await withService(async (sql) => {
    const order = await sql.maybeOne<{ id: string; school_id: string; student_id: string; amount_paise: number; allocations: { studentFeeAssignmentId: string; amountPaise: number }[]; status: string; created_by: string | null; is_demo: boolean }>(
      `select o.id, o.school_id, o.student_id, o.amount_paise, o.allocations, o.status, o.created_by, s.is_demo
       from payment_orders o join schools s on s.id = o.school_id where o.provider = $1 and o.provider_order_id = $2 for update of o`,
      [input.provider.name, input.providerOrderId],
    );
    if (!order) throw new AppError("Unknown payment order", "not_found");
    if (input.amountPaise !== undefined && input.amountPaise !== order.amount_paise) {
      throw new AppError("Captured amount does not match the order amount");
    }
    if (input.provider.isSandbox && !order.is_demo) throw new AppError("Sandbox payments are only allowed for demo schools", "forbidden");
    const payment = await recordPayment(sql, {
      schoolId: order.school_id,
      studentId: order.student_id,
      allocations: order.allocations.map((a) => ({ lineId: a.studentFeeAssignmentId, amount: a.amountPaise })),
      method: "gateway",
      mode: input.provider.isSandbox ? "sandbox" : "gateway",
      provider: input.provider.name,
      providerOrderId: input.providerOrderId,
      providerPaymentId: input.providerPaymentId,
      referenceNo: input.method ? `${input.method} via ${input.provider.name}` : null,
      paidAt: new Date().toISOString(),
      recordedBy: null,
      idempotencyKey: `${input.provider.name}:${input.providerPaymentId}`,
      notes: input.provider.isSandbox ? "SANDBOX — simulated payment, no money was transferred" : null,
    });
    await sql.exec("update payment_orders set status = 'paid', payment_id = $2 where id = $1", [order.id, payment.id]);
    return { ...payment, schoolId: order.school_id, studentId: order.student_id };
  });
  if (!result.duplicate) {
    const families = await familyUserIds([result.studentId]);
    await notifyUsers({
      schoolId: result.schoolId,
      userIds: families.get(result.studentId) ?? [],
      type: "fees",
      title: `Payment received — ${formatINR(result.amountPaise)}`,
      body: `Receipt ${result.receiptNo}${input.provider.isSandbox ? " (sandbox, not a real payment)" : ""}.`,
      link: `/app/fees/receipts/${result.id}`,
    });
  }
  logger.info("Gateway payment captured", { provider: input.provider.name, receipt: result.receiptNo, duplicate: result.duplicate });
  return result;
}

export async function markOrderFailed(providerName: string, providerOrderId: string) {
  await withService((sql) =>
    sql.exec("update payment_orders set status = 'failed' where provider = $1 and provider_order_id = $2 and status = 'created'", [providerName, providerOrderId]),
  );
}

export function sandboxPaymentId() {
  return `sandbox_pay_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export { providerByName };
