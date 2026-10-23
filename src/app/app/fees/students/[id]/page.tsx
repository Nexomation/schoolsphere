import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { XCircle } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, humanize } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePageContext } from "@/lib/auth/context";
import { listCategories, listPayments, studentLines } from "@/lib/data/fees";
import { currentYear, schoolToday } from "@/lib/data/school";
import { formatDate, formatDateTime } from "@/lib/domain/dates";
import { formatINR } from "@/lib/domain/money";
import { cancelFeeLineAction } from "../../actions";
import { CustomFeeDialog, DiscountDialog, RecordPaymentForm } from "./ledger-forms";

export const metadata: Metadata = { title: "Student fee ledger" };

export default async function StudentLedgerPage({ params }: PageProps<"/app/fees/students/[id]">) {
  const ctx = await requirePageContext("fees.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await ctx.db(async (sql) => {
    const student = await sql.maybeOne<{ id: string; name: string; admission_no: string; section_label: string | null; status: string }>(
      `select s.id, trim(s.first_name || ' ' || s.last_name) as name, s.admission_no, c.name || ' ' || sec.name as section_label, s.status
       from students s left join enrollments e on e.student_id = s.id and e.status = 'active'
       left join sections sec on sec.id = e.section_id left join classes c on c.id = sec.class_id where s.id = $1`,
      [id],
    );
    if (!student) return null;
    const year = await currentYear(sql, ctx.schoolId);
    return {
      student,
      today: await schoolToday(sql, ctx.schoolId),
      lines: await studentLines(sql, id, year.id),
      payments: await listPayments(sql, ctx.schoolId, { from: "2000-01-01", to: "2999-12-31", studentId: id }),
      categories: (await listCategories(sql, ctx.schoolId)).filter((c) => c.is_active),
    };
  });
  if (!d) notFound();
  const t = d.lines.reduce((a, l) => ({ net: a.net + l.net_paise, paid: a.paid + l.paid_paise, bal: a.bal + l.balance_paise }), { net: 0, paid: 0, bal: 0 });

  return (
    <>
      <PageHeader
        title={d.student.name}
        description={`${d.student.section_label ?? "Not enrolled"} · ${d.student.admission_no}`}
        back={{ href: "/app/fees/dues", label: "Dues" }}
        actions={
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/app/students/${d.student.id}`}>Student profile</Link>
            </Button>
            <CustomFeeDialog studentId={d.student.id} categories={d.categories.map((c) => ({ value: c.id, label: c.name }))} today={d.today} />
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Fee items</CardTitle>
            <CardDescription>Balance = amount − discount − captured payments.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Discount</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <span className="font-medium">{l.description}</span>
                      <span className={`block text-xs ${l.balance_paise > 0 && l.due_date < d.today ? "text-destructive" : "text-muted-foreground"}`}>
                        Due {formatDate(l.due_date)}
                        {l.discount_reason && ` · ${humanize(l.discount_type ?? "")}: ${l.discount_reason}`}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular">{formatINR(l.amount_paise)}</TableCell>
                    <TableCell className="hidden text-right tabular sm:table-cell">{l.discount_paise ? `−${formatINR(l.discount_paise)}` : "—"}</TableCell>
                    <TableCell className="hidden text-right tabular sm:table-cell">{formatINR(l.paid_paise)}</TableCell>
                    <TableCell className="text-right tabular font-medium">{l.balance_paise ? formatINR(l.balance_paise) : <StatusBadge status="paid" />}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <DiscountDialog line={l} />
                      {l.paid_paise === 0 && (
                        <ConfirmAction
                          action={cancelFeeLineAction.bind(null, l.id)}
                          title="Cancel this fee item?"
                          description={`${l.description} (${formatINR(l.net_paise)}) will no longer be charged. This is recorded in the audit log.`}
                          confirmLabel="Cancel item"
                          variant="destructive"
                          trigger={
                            <Button size="icon-sm" variant="ghost" aria-label={`Cancel ${l.description}`}>
                              <XCircle />
                            </Button>
                          }
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular">{formatINR(t.net + d.lines.reduce((s, l) => s + l.discount_paise, 0))}</TableCell>
                  <TableCell className="hidden text-right tabular sm:table-cell">−{formatINR(d.lines.reduce((s, l) => s + l.discount_paise, 0))}</TableCell>
                  <TableCell className="hidden text-right tabular sm:table-cell">{formatINR(t.paid)}</TableCell>
                  <TableCell className="text-right tabular">{formatINR(t.bal)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Record a counter payment</CardTitle>
            <CardDescription>Cash, cheque, UPI or bank transfer received at the school office.</CardDescription>
          </CardHeader>
          <CardContent>
            <RecordPaymentForm studentId={d.student.id} lines={d.lines} today={d.today} />
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
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
                      {p.reference_no && ` · ${p.reference_no}`}
                      {p.recorded_by_name && ` · by ${p.recorded_by_name}`}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`tabular ${p.status !== "captured" ? "line-through" : ""}`}>{formatINR(p.amount_paise)}</span>
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
