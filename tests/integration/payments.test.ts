import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordPayment } from "@/lib/payments/ledger";
import { captureVerifiedPayment, createCheckout } from "@/lib/payments/checkout";
import { hmacHex, razorpayProvider, sandboxProvider, signSandboxPayment } from "@/lib/payments/provider";
import { EMAILS, openTestDb, type TestDb } from "../helpers/fixture";

let t: TestDb;
let svm: string;

beforeAll(async () => {
  t = await openTestDb();
  svm = (await t.service((sql) => sql.one<{ id: string }>("select id from schools where slug = 'sri-vidya-mandir'"))).id;
});
afterAll(() => t.close());

async function openLine() {
  return t.service((sql) =>
    sql.one<{ id: string; student_id: string; balance_paise: number }>(
      `select id, student_id, balance_paise from student_fee_balances
       where school_id = $1 and description like 'Tuition fee – Term 3' and balance_paise > 0 order by id limit 1`,
      [svm],
    ),
  );
}

describe("counter payments (offline ledger)", () => {
  it("records a partial payment, issues a sequential receipt and reduces the balance", async () => {
    const line = await openLine();
    const accountant = await t.userId(EMAILS.svm.accounts);
    const before = await t.service((sql) => sql.one<{ n: string }>("select max(receipt_no) as n from payments where school_id = $1", [svm]));
    const p = await t.as(EMAILS.svm.accounts, (sql) =>
      recordPayment(sql, {
        schoolId: svm,
        studentId: line.student_id,
        allocations: [{ lineId: line.id, amount: 100_000 }],
        method: "cash",
        mode: "offline",
        paidAt: new Date().toISOString(),
        recordedBy: accountant,
        idempotencyKey: randomUUID(),
      }),
    );
    expect(p.duplicate).toBe(false);
    expect(p.amountPaise).toBe(100_000);
    expect(p.receiptNo).toMatch(/^SVM\/2026-27\/\d{5}$/);
    expect(Number(p.receiptNo.slice(-5))).toBe(Number(before.n.slice(-5)) + 1);
    const after = await t.service((sql) => sql.one<{ balance_paise: number }>("select balance_paise from student_fee_balances where id = $1", [line.id]));
    expect(after.balance_paise).toBe(line.balance_paise - 100_000);
  });

  it("is idempotent: retrying with the same key returns the original receipt", async () => {
    const line = await openLine();
    const accountant = await t.userId(EMAILS.svm.accounts);
    const key = randomUUID();
    const input = {
      schoolId: svm,
      studentId: line.student_id,
      allocations: [{ lineId: line.id, amount: 5_000 }],
      method: "upi",
      mode: "offline" as const,
      referenceNo: "UTR123",
      paidAt: new Date().toISOString(),
      recordedBy: accountant,
      idempotencyKey: key,
    };
    const first = await t.as(EMAILS.svm.accounts, (sql) => recordPayment(sql, input));
    const second = await t.as(EMAILS.svm.accounts, (sql) => recordPayment(sql, input));
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    const count = await t.service((sql) => sql.one<{ n: number }>("select count(*)::int as n from payments where idempotency_key = $1", [key]));
    expect(count.n).toBe(1);
  });

  it("rejects paying more than the outstanding balance", async () => {
    const line = await openLine();
    const accountant = await t.userId(EMAILS.svm.accounts);
    await expect(
      t.as(EMAILS.svm.accounts, (sql) =>
        recordPayment(sql, {
          schoolId: svm,
          studentId: line.student_id,
          allocations: [{ lineId: line.id, amount: line.balance_paise + 1 }],
          method: "cash",
          mode: "offline",
          paidAt: new Date().toISOString(),
          recordedBy: accountant,
          idempotencyKey: randomUUID(),
        }),
      ),
    ).rejects.toThrow(/exceeds the outstanding/);
  });

  it("rejects allocating to another student's fee line", async () => {
    const line = await openLine();
    const other = await t.service((sql) => sql.one<{ id: string }>("select id from students where school_id = $1 and id <> $2 limit 1", [svm, line.student_id]));
    const accountant = await t.userId(EMAILS.svm.accounts);
    await expect(
      t.as(EMAILS.svm.accounts, (sql) =>
        recordPayment(sql, {
          schoolId: svm,
          studentId: other.id,
          allocations: [{ lineId: line.id, amount: 100 }],
          method: "cash",
          mode: "offline",
          paidAt: new Date().toISOString(),
          recordedBy: accountant,
          idempotencyKey: randomUUID(),
        }),
      ),
    ).rejects.toThrow(/not payable/);
  });

  it("voiding a payment restores the balance", async () => {
    const line = await openLine();
    const accountant = await t.userId(EMAILS.svm.accounts);
    const p = await t.as(EMAILS.svm.accounts, (sql) =>
      recordPayment(sql, {
        schoolId: svm,
        studentId: line.student_id,
        allocations: [{ lineId: line.id, amount: 2_000 }],
        method: "cheque",
        mode: "offline",
        referenceNo: "CHQ1",
        paidAt: new Date().toISOString(),
        recordedBy: accountant,
        idempotencyKey: randomUUID(),
      }),
    );
    await t.as(EMAILS.svm.accounts, (sql) =>
      sql.exec("update payments set status = 'voided', voided_at = now(), voided_by = $2, void_reason = 'Cheque bounced' where id = $1", [p.id, accountant]),
    );
    const after = await t.service((sql) => sql.one<{ balance_paise: number }>("select balance_paise from student_fee_balances where id = $1", [line.id]));
    expect(after.balance_paise).toBe(line.balance_paise);
  });
});

describe("online checkout", () => {
  it("captures a verified sandbox payment once, even if the confirmation arrives twice", async () => {
    const parentId = await t.userId(EMAILS.svm.parent);
    const child = await t.as(EMAILS.svm.parent, (sql) => sql.one<{ id: string }>("select id from students where first_name = 'Aadhya'"));
    const lines = await t.as(EMAILS.svm.parent, (sql) =>
      sql.many<{ id: string; balance_paise: number }>("select id, balance_paise from student_fee_balances where student_id = $1 and balance_paise > 0", [child.id]),
    );
    expect(lines.length).toBeGreaterThan(0);
    const order = await t.as(EMAILS.svm.parent, (sql) => createCheckout(sql, { schoolId: svm, userId: parentId }, child.id, lines.map((l) => l.id)));
    expect(order.provider).toBe("sandbox");
    expect(order.amountPaise).toBe(lines.reduce((s, l) => s + l.balance_paise, 0));

    const paymentId = "sandbox_pay_test_1";
    expect(sandboxProvider.verifyPaymentSignature({ orderId: order.providerOrderId, paymentId, signature: signSandboxPayment(order.providerOrderId, paymentId) })).toBe(true);
    expect(sandboxProvider.verifyPaymentSignature({ orderId: order.providerOrderId, paymentId, signature: "forged" })).toBe(false);

    const first = await captureVerifiedPayment({ provider: sandboxProvider, providerOrderId: order.providerOrderId, providerPaymentId: paymentId });
    const again = await captureVerifiedPayment({ provider: sandboxProvider, providerOrderId: order.providerOrderId, providerPaymentId: paymentId });
    expect(again.id).toBe(first.id);
    expect(again.duplicate).toBe(true);

    const p = await t.service((sql) => sql.one<{ mode: string; amount_paise: number; notes: string }>("select mode, amount_paise, notes from payments where id = $1", [first.id]));
    expect(p.mode).toBe("sandbox");
    expect(p.notes).toMatch(/SANDBOX/);
    const remaining = await t.service((sql) =>
      sql.one<{ b: number }>("select coalesce(sum(balance_paise), 0)::int as b from student_fee_balances where student_id = $1", [child.id]),
    );
    expect(remaining.b).toBe(0);
  });

  it("rejects a capture whose amount differs from the order", async () => {
    const parentId = await t.userId(EMAILS.gvp.parent);
    const gvp = (await t.service((sql) => sql.one<{ id: string }>("select id from schools where slug = 'green-valley'"))).id;
    const child = await t.as(EMAILS.gvp.parent, (sql) => sql.one<{ id: string }>("select id from students limit 1"));
    const lines = await t.as(EMAILS.gvp.parent, (sql) =>
      sql.many<{ id: string }>("select id from student_fee_balances where student_id = $1 and balance_paise > 0", [child.id]),
    );
    const order = await t.as(EMAILS.gvp.parent, (sql) => createCheckout(sql, { schoolId: gvp, userId: parentId }, child.id, lines.map((l) => l.id)));
    await expect(
      captureVerifiedPayment({ provider: sandboxProvider, providerOrderId: order.providerOrderId, providerPaymentId: "sandbox_pay_x", amountPaise: 1 }),
    ).rejects.toThrow(/does not match/);
  });

  it("a parent cannot open a checkout for someone else's child", async () => {
    const parentId = await t.userId(EMAILS.svm.parent);
    const stranger = await t.service((sql) =>
      sql.one<{ student_id: string; id: string }>(
        "select student_id, id from student_fee_balances where school_id = $1 and student_id not in (select student_id from student_guardians sg join guardians g on g.id = sg.guardian_id where g.user_id = $2) and balance_paise > 0 limit 1",
        [svm, parentId],
      ),
    );
    await expect(t.as(EMAILS.svm.parent, (sql) => createCheckout(sql, { schoolId: svm, userId: parentId }, stranger.student_id, [stranger.id]))).rejects.toThrow();
  });
});

describe("Razorpay signature verification", () => {
  it("accepts the documented order|payment HMAC and rejects anything else", () => {
    const sig = hmacHex(process.env.RAZORPAY_KEY_SECRET!, "order_ABC|pay_XYZ");
    expect(razorpayProvider.verifyPaymentSignature({ orderId: "order_ABC", paymentId: "pay_XYZ", signature: sig })).toBe(true);
    expect(razorpayProvider.verifyPaymentSignature({ orderId: "order_ABC", paymentId: "pay_OTHER", signature: sig })).toBe(false);
  });

  it("verifies webhook bodies byte-for-byte", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 100 } } } });
    const sig = hmacHex(process.env.RAZORPAY_WEBHOOK_SECRET!, body);
    expect(razorpayProvider.verifyWebhookSignature(body, sig)).toBe(true);
    expect(razorpayProvider.verifyWebhookSignature(body.replace("100", "1"), sig)).toBe(false);
    expect(razorpayProvider.verifyWebhookSignature(body, null)).toBe(false);
  });
});
