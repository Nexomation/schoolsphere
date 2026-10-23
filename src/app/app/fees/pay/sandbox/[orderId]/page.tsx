import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { env } from "@/lib/env";
import { formatINR } from "@/lib/domain/money";
import { SandboxButtons } from "./sandbox-buttons";

export const metadata: Metadata = { title: "Sandbox checkout", robots: { index: false } };

/** Simulated gateway checkout for demo schools. Clearly labelled; no money moves. */
export default async function SandboxCheckoutPage({ params }: PageProps<"/app/fees/pay/sandbox/[orderId]">) {
  const ctx = await requirePageContext("payments.pay");
  if (!env().PAYMENTS_SANDBOX_ENABLED) notFound();
  const { orderId } = await params;
  const order = await ctx.db((sql) =>
    sql.maybeOne<{ amount_paise: number; status: string; student: string; school: string }>(
      `select o.amount_paise, o.status, trim(s.first_name || ' ' || s.last_name) as student, sc.name as school
       from payment_orders o join students s on s.id = o.student_id join schools sc on sc.id = o.school_id
       where o.provider = 'sandbox' and o.provider_order_id = $1 and o.created_by = $2`,
      [orderId, ctx.userId],
    ),
  );
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-md">
      <Card className="border-2 border-dashed border-warning">
        <CardHeader>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-warning uppercase">
            <FlaskConical className="size-4" aria-hidden /> Payment sandbox — not a real gateway
          </p>
          <CardTitle>{formatINR(order.amount_paise)}</CardTitle>
          <CardDescription>
            {order.school} · fees for {order.student}. This page stands in for a payment gateway in demo schools. Choosing an outcome below runs the same
            server-side verification and receipt process a real payment would, but no money is charged and the receipt is marked SANDBOX.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {order.status === "created" ? (
            <SandboxButtons orderId={orderId} />
          ) : (
            <p className="text-sm text-muted-foreground">This order is already {order.status}.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
