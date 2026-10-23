import { NextResponse, type NextRequest } from "next/server";
import { withService } from "@/lib/db";
import { logger } from "@/lib/logger";
import { captureVerifiedPayment, markOrderFailed } from "@/lib/payments/checkout";
import { hmacHex, razorpayProvider } from "@/lib/payments/provider";
import { env } from "@/lib/env";

/**
 * Razorpay webhook. Configure in the Razorpay dashboard with the events
 * payment.captured and payment.failed, and the secret in RAZORPAY_WEBHOOK_SECRET.
 *
 * 1. The signature is checked on the exact raw body before anything else.
 * 2. Every delivery is stored; (provider, event_id) makes redelivery a no-op.
 * 3. Capture goes through the same idempotent ledger path as the browser
 *    callback, so order of arrival does not matter.
 */
export async function POST(request: NextRequest) {
  if (env().PAYMENTS_PROVIDER !== "razorpay") {
    return NextResponse.json({ error: "Razorpay is not configured" }, { status: 404 });
  }
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  const valid = razorpayProvider.verifyWebhookSignature(raw, signature);
  // Razorpay sends x-razorpay-event-id; fall back to a hash of the body.
  const eventId = request.headers.get("x-razorpay-event-id") ?? hmacHex("event", raw);

  let payload: { event?: string; payload?: { payment?: { entity?: { id: string; order_id: string; amount: number; method?: string; status?: string } } } } = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const stored = await withService((sql) =>
    sql.one<{ id: string; processed_at: string | null }>(
      `insert into payment_webhook_events (provider, event_id, event_type, signature_valid, payload)
       values ('razorpay', $1, $2, $3, $4::jsonb)
       on conflict (provider, event_id) do update set signature_valid = payment_webhook_events.signature_valid or excluded.signature_valid
       returning id, processed_at`,
      [eventId, payload.event ?? "unknown", valid, raw],
    ),
  );
  if (!valid) {
    logger.warn("Rejected Razorpay webhook with invalid signature", { eventId });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  // Already handled: acknowledge without doing anything. Unprocessed (failed earlier) events are retried.
  if (stored.processed_at) return NextResponse.json({ status: "duplicate" });

  const entity = payload.payload?.payment?.entity;
  try {
    if (payload.event === "payment.captured" && entity?.order_id) {
      const result = await captureVerifiedPayment({
        provider: razorpayProvider,
        providerOrderId: entity.order_id,
        providerPaymentId: entity.id,
        amountPaise: entity.amount,
        method: entity.method,
      });
      await withService((sql) => sql.exec("update payment_webhook_events set processed_at = now(), school_id = $2 where id = $1", [stored.id, result.schoolId]));
    } else if (payload.event === "payment.failed" && entity?.order_id) {
      await markOrderFailed("razorpay", entity.order_id);
      await withService((sql) => sql.exec("update payment_webhook_events set processed_at = now() where id = $1", [stored.id]));
    }
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    logger.error("Webhook processing failed", { eventId, error });
    await withService((sql) =>
      sql.exec("update payment_webhook_events set processing_error = $2 where id = $1", [stored.id, (error as Error).message.slice(0, 500)]),
    );
    // 500 so Razorpay retries; the stored event row prevents double processing of successes.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
