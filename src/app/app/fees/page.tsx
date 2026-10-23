import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, IndianRupee, Receipt, Wallet } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge, humanize } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UrlPicker } from "@/components/url-controls";
import { requirePageContext, type SchoolContext } from "@/lib/auth/context";
import { duesByStudent, listPayments, studentLines } from "@/lib/data/fees";
import { currentYear, familyChildren, pickChild, schoolProfile, schoolToday } from "@/lib/data/school";
import { formatDate, formatDateTime, monthRange } from "@/lib/domain/dates";
import { formatINR, formatINRCompact } from "@/lib/domain/money";
import { providerForSchool } from "@/lib/payments/provider";
import type { SearchParams } from "@/components/data-table";
import { PayOnline } from "./pay-online";

export const metadata: Metadata = { title: "Fees & payments" };

export default async function FeesPage({ searchParams }: PageProps<"/app/fees">) {
  const ctx = await requirePageContext("fees.view");
  const sp = await searchParams;
  if (ctx.role === "parent") return <ParentFees ctx={ctx} sp={sp} />;
  return <StaffFees ctx={ctx} />;
}

async function StaffFees({ ctx }: { ctx: SchoolContext }) {
  const d = await ctx.db(async (sql) => {
    const today = await schoolToday(sql, ctx.schoolId);
    const year = await currentYear(sql, ctx.schoolId);
    const { from, to } = monthRange(today.slice(0, 7));
    const dues = await duesByStudent(sql, ctx.schoolId, year.id, today);
    const month = await listPayments(sql, ctx.schoolId, { from, to });
    const todays = month.filter((p) => p.paid_at.slice(0, 10) === today || formatDate(p.paid_at.slice(0, 10)) === formatDate(today));
    return { today, year, dues, month, todays };
  });
  const captured = (rows: typeof d.month) => rows.filter((p) => p.status === "captured").reduce((s, p) => s + p.amount_paise, 0);
  const outstanding = d.dues.reduce((s, r) => s + r.balance_paise, 0);
  const overdue = d.dues.reduce((s, r) => s + r.overdue_paise, 0);
  const billed = d.dues.reduce((s, r) => s + r.net_paise, 0);
  const collected = d.dues.reduce((s, r) => s + r.paid_paise, 0);

  return (
    <>
      <PageHeader title="Fees & payments" description={`Academic year ${d.year.name}. All amounts in Indian rupees.`} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Collected this month" value={formatINRCompact(captured(d.month))} hint={`${d.month.filter((p) => p.status === "captured").length} receipts`} icon={IndianRupee} tone="success" href="/app/fees/payments" />
        <StatCard label="Billed for the year" value={formatINRCompact(billed)} hint={`${formatINRCompact(collected)} collected (${billed ? Math.round((collected / billed) * 100) : 0}%)`} icon={Receipt} />
        <StatCard label="Outstanding (year)" value={formatINRCompact(outstanding)} icon={Wallet} href="/app/fees/dues" />
        <StatCard label="Overdue now" value={formatINRCompact(overdue)} hint={`${d.dues.filter((r) => r.overdue_paise > 0).length} students`} icon={AlertTriangle} tone={overdue ? "danger" : "default"} href="/app/fees/dues?overdue=1" />
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Recent receipts</CardTitle>
            <CardDescription>To record a payment, open the student from Dues &amp; collection.</CardDescription>
          </div>
          <Link href="/app/fees/payments" className="text-sm text-primary hover:underline">
            All payments
          </Link>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="hidden sm:table-cell">Method</TableHead>
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.month.slice(0, 8).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/app/fees/receipts/${p.id}`} className="font-medium hover:text-primary hover:underline">
                      {p.receipt_no}
                    </Link>
                    {p.status !== "captured" && <StatusBadge status={p.status} className="ml-2" />}
                    {p.mode === "sandbox" && <StatusBadge status="sandbox" className="ml-2" />}
                  </TableCell>
                  <TableCell>{p.student_name}</TableCell>
                  <TableCell className="hidden sm:table-cell">{humanize(p.method)}</TableCell>
                  <TableCell className="hidden md:table-cell">{formatDateTime(p.paid_at)}</TableCell>
                  <TableCell className="text-right tabular">{formatINR(p.amount_paise)}</TableCell>
                </TableRow>
              ))}
              {d.month.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No payments this month yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

async function ParentFees({ ctx, sp }: { ctx: SchoolContext; sp: SearchParams }) {
  const d = await ctx.db(async (sql) => {
    const children = await familyChildren(sql, ctx.schoolId);
    const child = pickChild(children, sp.child);
    const today = await schoolToday(sql, ctx.schoolId);
    const school = await schoolProfile(sql, ctx.schoolId);
    if (!child) return { children, child: null, today, lines: [], payments: [], provider: null };
    const year = await currentYear(sql, ctx.schoolId);
    return {
      children,
      child,
      today,
      lines: await studentLines(sql, child.id, year.id),
      payments: await listPayments(sql, ctx.schoolId, { from: year.start_date, to: year.end_date, studentId: child.id }),
      provider: providerForSchool(school)?.name ?? null,
    };
  });
  if (!d.child) return <EmptyState title="No linked children" />;
  const balance = d.lines.reduce((s, l) => s + l.balance_paise, 0);
  const overdue = d.lines.filter((l) => l.due_date < d.today).reduce((s, l) => s + l.balance_paise, 0);
  const open = d.lines.filter((l) => l.balance_paise > 0);

  return (
    <>
      <PageHeader
        title="Fees"
        description={`${d.child.full_name} · ${d.child.section_label ?? ""}`}
        actions={d.children.length > 1 && <UrlPicker param="child" label="Child" value={d.child.id} options={d.children.map((c) => ({ value: c.id, label: c.full_name }))} />}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Balance for the year" value={formatINR(balance, { whole: true })} icon={Wallet} />
        <StatCard label="Overdue" value={formatINR(overdue, { whole: true })} tone={overdue ? "danger" : "success"} icon={AlertTriangle} />
        <StatCard label="Paid so far" value={formatINR(d.lines.reduce((s, l) => s + l.paid_paise, 0), { whole: true })} tone="success" icon={Receipt} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pay fees</CardTitle>
            <CardDescription>{open.length ? "Select the items to pay." : "Nothing is due. Thank you!"}</CardDescription>
          </CardHeader>
          <CardContent>
            {open.length === 0 ? null : d.provider ? (
              <PayOnline studentId={d.child.id} lines={open} mode={d.provider} today={d.today} />
            ) : (
              <p className="text-sm text-muted-foreground">Online payment is not enabled for this school yet. Please pay at the school office; your receipt will appear here.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fee items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {d.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <span className="font-medium">{l.description}</span>
                      <span className="block text-xs text-muted-foreground">
                        Due {formatDate(l.due_date)}
                        {l.discount_paise > 0 && ` · ${formatINR(l.discount_paise)} ${humanize(l.discount_type ?? "discount").toLowerCase()} concession`}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="tabular">{formatINR(l.net_paise)}</span>
                      <span className="block">
                        {l.balance_paise === 0 ? <StatusBadge status="paid" /> : l.paid_paise > 0 ? <StatusBadge status="partial" label={`${formatINR(l.balance_paise)} due`} /> : <StatusBadge status={l.due_date < d.today ? "overdue" : "due"} />}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Payment history & receipts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              {d.payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/app/fees/receipts/${p.id}`} className="font-medium hover:text-primary hover:underline">
                      {p.receipt_no}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(p.paid_at)} · {humanize(p.method)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="tabular">{formatINR(p.amount_paise)}</span>
                    {p.status !== "captured" && <StatusBadge status={p.status} className="ml-2" />}
                    {p.mode === "sandbox" && <StatusBadge status="sandbox" className="ml-2" />}
                  </TableCell>
                </TableRow>
              ))}
              {d.payments.length === 0 && (
                <TableRow>
                  <TableCell className="py-6 text-center text-sm text-muted-foreground">No payments yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
