import type { Metadata } from "next";
import { SimpleBarChart } from "@/components/charts";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, humanize } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UrlDateInput } from "@/components/url-date-input";
import { requirePageContext } from "@/lib/auth/context";
import { collectionSummary, reconciliation } from "@/lib/data/fees";
import { schoolToday } from "@/lib/data/school";
import { env } from "@/lib/env";
import { formatDate, formatDateTime, monthRange } from "@/lib/domain/dates";
import { formatINR } from "@/lib/domain/money";

export const metadata: Metadata = { title: "Fee reports" };

const valid = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function FeeReportsPage({ searchParams }: PageProps<"/app/fees/reports">) {
  const ctx = await requirePageContext("fees.manage");
  const sp = await searchParams;
  const today = await ctx.db((sql) => schoolToday(sql, ctx.schoolId));
  const from = valid(sp.from) ? (sp.from as string) : monthRange(today.slice(0, 7)).from;
  const to = valid(sp.to) ? (sp.to as string) : today;
  const d = await ctx.db(async (sql) => ({ summary: await collectionSummary(sql, ctx.schoolId, from, to), recon: await reconciliation(sql, ctx.schoolId) }));
  const total = d.summary.byMethod.reduce((s, r) => s + r.total, 0);
  const gateway = env().PAYMENTS_PROVIDER === "razorpay" ? "Razorpay (live credentials configured)" : env().PAYMENTS_SANDBOX_ENABLED ? "Sandbox only (demo schools); no real gateway configured" : "Not configured";

  return (
    <>
      <PageHeader title="Collection reports & reconciliation" description={`Captured payments between ${formatDate(from)} and ${formatDate(to)}: ${formatINR(total)}.`} />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <UrlDateInput param="from" value={from} label="From" max={today} />
        <UrlDateInput param="to" value={to} label="To" max={today} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily collection</CardTitle>
          </CardHeader>
          <CardContent>
            {d.summary.byDay.length ? (
              <SimpleBarChart name="Collected" valueFormat="inr" data={d.summary.byDay.map((r) => ({ label: r.day.slice(8), value: Math.round(r.total / 100) }))} />
            ) : (
              <p className="text-sm text-muted-foreground">No collections in this period.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By payment method</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {d.summary.byMethod.map((r) => (
                  <TableRow key={`${r.method}-${r.mode}`}>
                    <TableCell>
                      {humanize(r.method)} {r.mode === "sandbox" && <StatusBadge status="sandbox" />}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular">{r.count} receipts</TableCell>
                    <TableCell className="text-right tabular">{formatINR(r.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By fee category</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {d.summary.byCategory.map((r) => (
                  <TableRow key={r.category}>
                    <TableCell>{r.category}</TableCell>
                    <TableCell className="text-right tabular">{formatINR(r.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Billing status by class (year to date)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.summary.byClass.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell>{r.label}</TableCell>
                    <TableCell className="text-right tabular">{formatINR(r.net, { whole: true })}</TableCell>
                    <TableCell className="text-right tabular">{formatINR(r.paid, { whole: true })}</TableCell>
                    <TableCell className="text-right tabular">{formatINR(r.balance, { whole: true })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Online payment reconciliation</CardTitle>
          <CardDescription>Gateway: {gateway}. Each order should end as paid (with a receipt) or failed. Orders stuck as “created” for long may need checking in the gateway dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.recon.orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    No online orders yet.
                  </TableCell>
                </TableRow>
              )}
              {d.recon.orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">
                    {o.provider_order_id} {o.provider === "sandbox" && <StatusBadge status="sandbox" />}
                  </TableCell>
                  <TableCell>{o.student_name}</TableCell>
                  <TableCell className="text-sm">{formatDateTime(o.created_at)}</TableCell>
                  <TableCell>
                    <StatusBadge status={o.status === "created" ? "pending" : o.status} label={humanize(o.status)} />
                  </TableCell>
                  <TableCell>{o.receipt_no ?? "—"}</TableCell>
                  <TableCell className="text-right tabular">{formatINR(o.amount_paise)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {d.recon.webhooks.length > 0 && (
            <div className="border-t p-4 text-sm">
              <p className="mb-2 font-medium">Recent webhook deliveries</p>
              <ul className="grid gap-1">
                {d.recon.webhooks.map((w) => (
                  <li key={w.id} className="flex justify-between gap-2">
                    <span>
                      {w.event_type} · {formatDateTime(w.received_at)}
                    </span>
                    <span>{w.processing_error ? <StatusBadge status="failed" tone="danger" label="Error" /> : w.processed_at ? <StatusBadge status="completed" label="Processed" tone="success" /> : <StatusBadge status="pending" />}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
