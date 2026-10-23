"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatINR } from "@/lib/domain/money";
import { formatDate } from "@/lib/domain/dates";
import { startCheckoutAction, verifyCheckoutAction } from "./actions";

type Line = { id: string; description: string; due_date: string; balance_paise: number };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, cb: (r: unknown) => void): void };
  }
}

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment window"));
    document.body.appendChild(s);
  });
}

export function PayOnline({ studentId, lines, mode, today }: { studentId: string; lines: Line[]; mode: "razorpay" | "sandbox"; today: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(lines.filter((l) => l.due_date <= today).map((l) => l.id)));
  const [pending, start] = useTransition();
  const total = useMemo(() => lines.filter((l) => selected.has(l.id)).reduce((s, l) => s + l.balance_paise, 0), [lines, selected]);

  const pay = () =>
    start(async () => {
      const res = await startCheckoutAction({ studentId, lineIds: [...selected] });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const order = res.data;
      if (order.provider === "sandbox") {
        router.push(`/app/fees/pay/sandbox/${order.providerOrderId}`);
        return;
      }
      try {
        await loadRazorpay();
      } catch (e) {
        toast.error((e as Error).message);
        return;
      }
      const rzp = new window.Razorpay!({
        key: order.keyId,
        order_id: order.providerOrderId,
        amount: order.amountPaise,
        currency: "INR",
        name: "School fees",
        description: order.description.slice(0, 250),
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const v = await verifyCheckoutAction({ provider: "razorpay", orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
          if (v.ok) {
            toast.success(v.message);
            router.push(`/app/fees/receipts/${v.data.paymentId}`);
          } else toast.error(v.error);
        },
      });
      rzp.on("payment.failed", () => toast.error("The payment did not go through. No money was taken, or it will be refunded by your bank."));
      rzp.open();
    });

  return (
    <div className="grid gap-3">
      {mode === "sandbox" && (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          Sandbox mode: this demo school uses a simulated payment gateway. No real money is charged and receipts are marked as sandbox.
        </p>
      )}
      <ul className="divide-y rounded-lg border">
        {lines.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <Checkbox
              checked={selected.has(l.id)}
              onCheckedChange={(v) =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (v === true) n.add(l.id);
                  else n.delete(l.id);
                  return n;
                })
              }
              aria-label={`Pay ${l.description}`}
            />
            <span className="flex-1">
              {l.description}
              <span className={`block text-xs ${l.due_date < today ? "text-destructive" : "text-muted-foreground"}`}>Due {formatDate(l.due_date)}</span>
            </span>
            <span className="tabular font-medium">{formatINR(l.balance_paise)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">
          Total: <strong className="tabular text-base">{formatINR(total)}</strong>
        </span>
        <Button onClick={pay} disabled={pending || total === 0}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CreditCard aria-hidden />}
          Pay {formatINR(total)} online
        </Button>
      </div>
    </div>
  );
}
