import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/**
 * Payment gateway boundary. Orders are created on the server, the browser
 * only opens the provider's checkout, and a payment is recorded ONLY after
 * the server verifies the provider's signature (or a signed webhook). A
 * browser "success" callback on its own is never trusted.
 */
export type CreatedOrder = { providerOrderId: string; amountPaise: number; currency: "INR" };

export interface PaymentProvider {
  readonly name: "razorpay" | "sandbox";
  readonly isSandbox: boolean;
  createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<CreatedOrder>;
  /** Signature returned to the browser after checkout. */
  verifyPaymentSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  /** Signature on the raw webhook body. */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;
  /** Public key for the checkout script (never the secret). */
  publicKey(): string | null;
}

export function hmacHex(secret: string, message: string) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

export function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export const razorpayProvider: PaymentProvider = {
  name: "razorpay",
  isSandbox: false,
  async createOrder({ amountPaise, receipt, notes }) {
    const config = env();
    const auth = Buffer.from(`${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: receipt.slice(0, 40), notes }),
    });
    if (!res.ok) throw new Error(`Razorpay order creation failed (${res.status})`);
    const json = (await res.json()) as { id: string; amount: number; currency: string };
    if (json.amount !== amountPaise || json.currency !== "INR") throw new Error("Razorpay returned an unexpected order amount");
    return { providerOrderId: json.id, amountPaise: json.amount, currency: "INR" };
  },
  verifyPaymentSignature({ orderId, paymentId, signature }) {
    const secret = env().RAZORPAY_KEY_SECRET;
    if (!secret) return false;
    return safeEqualHex(hmacHex(secret, `${orderId}|${paymentId}`), signature);
  },
  verifyWebhookSignature(rawBody, signature) {
    const secret = env().RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !signature) return false;
    return safeEqualHex(hmacHex(secret, rawBody), signature);
  },
  publicKey: () => env().RAZORPAY_KEY_ID ?? null,
};

/**
 * Development/demo provider. No money moves. The "checkout" is a page inside
 * SchoolSphere, and the signature is computed by this server with a secret
 * derived from AUTH_SECRET, so the capture path is exercised end to end.
 * Only usable for demo schools with PAYMENTS_SANDBOX_ENABLED=true.
 */
function sandboxSecret() {
  return hmacHex(env().AUTH_SECRET ?? "sandbox", "schoolsphere-payment-sandbox");
}

export const sandboxProvider: PaymentProvider = {
  name: "sandbox",
  isSandbox: true,
  async createOrder({ amountPaise }) {
    return { providerOrderId: `sandbox_order_${randomUUID().replace(/-/g, "").slice(0, 20)}`, amountPaise, currency: "INR" };
  },
  verifyPaymentSignature({ orderId, paymentId, signature }) {
    return safeEqualHex(hmacHex(sandboxSecret(), `${orderId}|${paymentId}`), signature);
  },
  verifyWebhookSignature() {
    return false;
  },
  publicKey: () => null,
};

export function signSandboxPayment(orderId: string, paymentId: string) {
  return hmacHex(sandboxSecret(), `${orderId}|${paymentId}`);
}

/** The provider parents use to pay a given school, or null when online payment is unavailable. */
export function providerForSchool(school: { is_demo: boolean }): PaymentProvider | null {
  const config = env();
  if (config.PAYMENTS_PROVIDER === "razorpay") return razorpayProvider;
  if (config.PAYMENTS_SANDBOX_ENABLED && school.is_demo) return sandboxProvider;
  return null;
}

export function providerByName(name: string): PaymentProvider | null {
  if (name === "razorpay" && env().PAYMENTS_PROVIDER === "razorpay") return razorpayProvider;
  if (name === "sandbox" && env().PAYMENTS_SANDBOX_ENABLED) return sandboxProvider;
  return null;
}
