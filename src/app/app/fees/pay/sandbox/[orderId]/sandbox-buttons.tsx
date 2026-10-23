"use client";

import { useRouter } from "next/navigation";
import { useActionRunner } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { simulateSandboxPaymentAction } from "../../../actions";

export function SandboxButtons({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button
        disabled={pending}
        onClick={() =>
          run(() => simulateSandboxPaymentAction(orderId, "success"), {
            onSuccess: (d) => router.push(d.paymentId ? `/app/fees/receipts/${d.paymentId}` : "/app/fees"),
          })
        }
      >
        Simulate successful payment
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => run(() => simulateSandboxPaymentAction(orderId, "failure"), { onSuccess: () => router.push("/app/fees") })}>
        Simulate failure
      </Button>
    </div>
  );
}
