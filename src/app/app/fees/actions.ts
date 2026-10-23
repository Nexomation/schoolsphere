"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { requireActionContext } from "@/lib/auth/context";
import { addCustomFee, applyDiscount, assignStructureToClass, cancelFeeLine, createCategory, createStructures, overdueStudentIds, voidPayment } from "@/lib/data/fees";
import { familyUserIds, notifyUsers } from "@/lib/data/notifications";
import { currentYear, schoolToday } from "@/lib/data/school";
import { formatINR } from "@/lib/domain/money";
import { AppError, ForbiddenError } from "@/lib/errors";
import { captureVerifiedPayment, createCheckout, markOrderFailed, providerByName, sandboxPaymentId } from "@/lib/payments/checkout";
import { recordPayment } from "@/lib/payments/ledger";
import { signSandboxPayment } from "@/lib/payments/provider";
import { customFeeInput, discountInput, feeCategoryInput, feeStructureInput, offlinePaymentInput, onlinePaymentInput, voidPaymentInput } from "@/lib/schemas/fees";

export async function createCategoryAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("fees.manage");
    const data = parseInput(feeCategoryInput, input);
    await ctx.db((sql) => createCategory(sql, ctx.schoolId, data));
    revalidatePath("/app/fees/setup");
    return ok(null, "Fee category added");
  });
}

export async function createStructureAction(input: unknown): Promise<ActionResult<{ lines: number }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("fees.manage");
    const data = parseInput(feeStructureInput, input);
    const lines = await ctx.db(async (sql) => createStructures(sql, ctx.schoolId, (await currentYear(sql, ctx.schoolId)).id, ctx.userId, data));
    revalidatePath("/app/fees");
    return ok({ lines }, `Fee structure saved${data.assignToStudents ? ` and ${lines} fee items created for students` : ""}`);
  });
}

export async function assignStructureAction(structureId: string): Promise<ActionResult<{ lines: number }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("fees.manage");
    const lines = await ctx.db((sql) => assignStructureToClass(sql, ctx.schoolId, ctx.userId, z.uuid().parse(structureId)));
    revalidatePath("/app/fees/setup");
    return ok({ lines }, lines ? `${lines} new fee items created` : "Every enrolled student is already billed");
  });
}

export async function addCustomFeeAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("fees.manage");
    const data = parseInput(customFeeInput, input);
    await ctx.db(async (sql) => addCustomFee(sql, ctx.schoolId, ctx.userId, (await currentYear(sql, ctx.schoolId)).id, data));
    revalidatePath(`/app/fees/students/${data.studentId}`);
    return ok(null, "Fee item added");
  });
}

export async function applyDiscountAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("fees.manage");
    const data = parseInput(discountInput, input);
    const r = await ctx.db((sql) => applyDiscount(sql, ctx.schoolId, data), { reason: `Discount: ${data.reason}` });
    revalidatePath(`/app/fees/students/${r.studentId}`);
    return ok(null, r.discount ? `Discount of ${formatINR(r.discount)} applied` : "Discount removed");
  });
}

export async function cancelFeeLineAction(lineId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("fees.manage");
    const studentId = await ctx.db((sql) => cancelFeeLine(sql, ctx.schoolId, z.uuid().parse(lineId)), { reason: "Fee item cancelled" });
    revalidatePath(`/app/fees/students/${studentId}`);
    return ok(null, "Fee item cancelled");
  });
}

export async function recordOfflinePaymentAction(input: unknown): Promise<ActionResult<{ paymentId: string; receiptNo: string; duplicate: boolean }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("payments.record");
    const data = parseInput(offlinePaymentInput, input);
    const today = await ctx.db((sql) => schoolToday(sql, ctx.schoolId));
    if (data.paidOn > today) throw new AppError("The payment date cannot be in the future.");
    if (["cheque", "upi", "bank_transfer", "card", "netbanking"].includes(data.method) && !data.referenceNo) {
      throw new AppError("Enter the cheque, UTR or transaction reference number.", "bad_request", { referenceNo: "Required for this payment method" });
    }
    const result = await ctx.db((sql) =>
      recordPayment(sql, {
        schoolId: ctx.schoolId,
        studentId: data.studentId,
        allocations: data.allocations,
        method: data.method,
        mode: "offline",
        referenceNo: data.referenceNo,
        // Counter receipts are dated at noon IST on the chosen day.
        paidAt: data.paidOn === today ? new Date().toISOString() : new Date(`${data.paidOn}T12:00:00+05:30`).toISOString(),
        recordedBy: ctx.userId,
        idempotencyKey: data.idempotencyKey,
        notes: data.notes,
      }),
    );
    if (!result.duplicate) {
      const families = await familyUserIds([data.studentId]);
      await notifyUsers(
        {
          schoolId: ctx.schoolId,
          userIds: families.get(data.studentId) ?? [],
          type: "fees",
          title: `Payment received — ${formatINR(result.amountPaise)}`,
          body: `Receipt ${result.receiptNo}. Thank you.`,
          link: `/app/fees/receipts/${result.id}`,
        },
        ctx.userId,
      );
    }
    revalidatePath(`/app/fees/students/${data.studentId}`);
    revalidatePath("/app/fees");
    return ok({ paymentId: result.id, receiptNo: result.receiptNo, duplicate: result.duplicate }, result.duplicate ? `Already recorded as ${result.receiptNo}` : `Receipt ${result.receiptNo} issued`);
  });
}

export async function voidPaymentAction(paymentId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("payments.record");
    const data = parseInput(voidPaymentInput, { paymentId, reason });
    await ctx.db((sql) => voidPayment(sql, ctx.schoolId, ctx.userId, data.paymentId, data.reason), { reason: `Receipt voided: ${data.reason}` });
    revalidatePath(`/app/fees/receipts/${paymentId}`);
    return ok(null, "Receipt voided. The balance has been restored.");
  });
}

export async function sendFeeRemindersAction(studentIds?: string[]): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("fees.manage");
    const ids = studentIds ? z.array(z.uuid()).parse(studentIds) : undefined;
    const overdue = await ctx.db(async (sql) => overdueStudentIds(sql, ctx.schoolId, await schoolToday(sql, ctx.schoolId), ids));
    const families = await familyUserIds(overdue.map((o) => o.student_id));
    for (const o of overdue) {
      await notifyUsers(
        {
          schoolId: ctx.schoolId,
          userIds: families.get(o.student_id) ?? [],
          type: "fees",
          title: "Fee payment reminder",
          body: `${formatINR(o.overdue)} is overdue. Please pay at the school office or online.`,
          link: "/app/fees",
        },
        ctx.userId,
      );
    }
    return ok({ count: overdue.length }, `Reminders sent to ${overdue.length} famil${overdue.length === 1 ? "y" : "ies"}`);
  });
}

// ---------------------------------------------------------------- parent checkout
export async function startCheckoutAction(input: unknown): Promise<ActionResult<{ provider: string; providerOrderId: string; amountPaise: number; keyId: string | null; description: string }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("payments.pay");
    const data = parseInput(onlinePaymentInput, input);
    const order = await ctx.db((sql) => createCheckout(sql, ctx, data.studentId, data.lineIds));
    return ok(order);
  });
}

/** Browser callback after Razorpay checkout. Only a valid signature leads to a recorded payment. */
export async function verifyCheckoutAction(input: unknown): Promise<ActionResult<{ paymentId: string; receiptNo: string }>> {
  return runAction(async () => {
    await requireActionContext("payments.pay");
    const data = parseInput(z.object({ provider: z.literal("razorpay"), orderId: z.string().min(5), paymentId: z.string().min(5), signature: z.string().min(10) }), input);
    const provider = providerByName(data.provider);
    if (!provider || !provider.verifyPaymentSignature({ orderId: data.orderId, paymentId: data.paymentId, signature: data.signature })) {
      throw new AppError("We could not verify this payment. If money was deducted, it will be confirmed automatically or refunded.");
    }
    const r = await captureVerifiedPayment({ provider, providerOrderId: data.orderId, providerPaymentId: data.paymentId });
    revalidatePath("/app/fees");
    return ok({ paymentId: r.id, receiptNo: r.receiptNo }, `Payment confirmed — receipt ${r.receiptNo}`);
  });
}

/**
 * SANDBOX ONLY. Simulates the provider's checkout outcome for demo schools.
 * The server signs the simulated payment and then runs the real verification
 * and capture path, so nothing is trusted from the browser.
 */
export async function simulateSandboxPaymentAction(orderId: string, outcome: "success" | "failure"): Promise<ActionResult<{ paymentId?: string; receiptNo?: string }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("payments.pay");
    const provider = providerByName("sandbox");
    if (!provider) throw new ForbiddenError("The payment sandbox is disabled.");
    const order = await ctx.db((sql) =>
      sql.maybeOne<{ status: string }>("select status from payment_orders where provider = 'sandbox' and provider_order_id = $1 and created_by = $2", [
        z.string().parse(orderId),
        ctx.userId,
      ]),
    );
    if (!order) throw new AppError("Order not found", "not_found");
    if (order.status !== "created") throw new AppError("This order has already been completed.");
    if (outcome === "failure") {
      await markOrderFailed("sandbox", orderId);
      return ok({}, "Simulated payment failure recorded. No money moved.");
    }
    const paymentId = sandboxPaymentId();
    const signature = signSandboxPayment(orderId, paymentId);
    if (!provider.verifyPaymentSignature({ orderId, paymentId, signature })) throw new AppError("Sandbox signature check failed");
    const r = await captureVerifiedPayment({ provider, providerOrderId: orderId, providerPaymentId: paymentId, method: "sandbox" });
    revalidatePath("/app/fees");
    return ok({ paymentId: r.id, receiptNo: r.receiptNo }, `Sandbox payment recorded — receipt ${r.receiptNo}`);
  });
}
