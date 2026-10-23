import Link from "next/link";
import { AlertTriangle, IndianRupee, Receipt, Wallet } from "lucide-react";
import { SimpleBarChart } from "@/components/charts";
import { StatCard } from "@/components/stat-card";
import { StatusBadge, humanize } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SchoolContext } from "@/lib/auth/context";
import { feeCollectionByMonth } from "@/lib/data/dashboard";
import { duesByStudent, listPayments } from "@/lib/data/fees";
import { currentYear, schoolToday } from "@/lib/data/school";
import { formatDateTime, monthRange } from "@/lib/domain/dates";
import { formatINR, formatINRCompact } from "@/lib/domain/money";

export async function AccountantDashboard({ ctx }: { ctx: SchoolContext }) {
  const d = await ctx.db(async (sql) => {
    const today = await schoolToday(sql, ctx.schoolId);
    const year = await currentYear(sql, ctx.schoolId);
    const { from } = monthRange(today.slice(0, 7));
    return {
      today,
      dues: await duesByStudent(sql, ctx.schoolId, year.id, today),
      month: await listPayments(sql, ctx.schoolId, { from, to: today }),
      monthly: await feeCollectionByMonth(sql, ctx.schoolId, today),
      pendingOrders: (await sql.one<{ n: number }>("select count(*)::int as n from payment_orders where school_id = $1 and status = 'created' and created_at < now() - interval '1 hour'", [ctx.schoolId])).n,
    };
  });
  const captured = d.month.filter((p) => p.status === "captured");
  const todays = captured.filter((p) => new Date(p.paid_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === d.today);
  const overdue = d.dues.filter((r) => r.overdue_paise > 0).sort((a, b) => b.overdue_paise - a.overdue_paise);

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Collected today" value={formatINR(todays.reduce((s, p) => s + p.amount_paise, 0), { whole: true })} hint={`${todays.length} receipts`} icon={IndianRupee} tone="success" href="/app/fees/payments" />
        <StatCard label="Collected this month" value={formatINRCompact(captured.reduce((s, p) => s + p.amount_paise, 0))} icon={Receipt} href="/app/fees/reports" />
        <StatCard label="Outstanding (year)" value={formatINRCompact(d.dues.reduce((s, r) => s + r.balance_paise, 0))} icon={Wallet} href="/app/fees/dues" />
        <StatCard label="Overdue" value={formatINRCompact(overdue.reduce((s, r) => s + r.overdue_paise, 0))} hint={`${overdue.length} students`} icon={AlertTriangle} tone={overdue.length ? "danger" : "success"} href="/app/fees/dues?overdue=1" />
      </div>
      {d.pendingOrders > 0 && (
        <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">
          {d.pendingOrders} online payment order(s) have been open for over an hour.{" "}
          <Link href="/app/fees/reports" className="font-medium underline">
            Check reconciliation
          </Link>
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Largest overdue balances</CardTitle>
            <CardDescription>Open a student to record a payment.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {overdue.slice(0, 8).map((r) => (
                <li key={r.student_id} className="flex justify-between gap-2 py-2">
                  <Link href={`/app/fees/students/${r.student_id}`} className="hover:text-primary hover:underline">
                    {r.student_name} <span className="text-muted-foreground">{r.section_label}</span>
                  </Link>
                  <span className="text-destructive tabular">{formatINR(r.overdue_paise, { whole: true })}</span>
                </li>
              ))}
              {overdue.length === 0 && <li className="py-2 text-muted-foreground">No overdue balances.</li>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Collections by month</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              name="Collected"
              valueFormat="inr"
              data={d.monthly.map((m) => ({ label: new Date(`${m.month}-01T00:00:00Z`).toLocaleString("en-IN", { month: "short", timeZone: "UTC" }), value: Math.round(m.collected / 100) }))}
            />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Latest receipts</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {d.month.slice(0, 6).map((p) => (
              <li key={p.id} className="flex justify-between gap-2 py-2">
                <Link href={`/app/fees/receipts/${p.id}`} className="hover:text-primary hover:underline">
                  {p.receipt_no} · {p.student_name}
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(p.paid_at)} · {humanize(p.method)}
                  </span>
                </Link>
                <span className="tabular">
                  {formatINR(p.amount_paise)} {p.status !== "captured" && <StatusBadge status={p.status} />}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
