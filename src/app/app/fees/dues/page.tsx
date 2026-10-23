import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { requirePageContext } from "@/lib/auth/context";
import { duesByStudent } from "@/lib/data/fees";
import { currentYear, schoolToday } from "@/lib/data/school";
import { formatDate } from "@/lib/domain/dates";
import { formatINR } from "@/lib/domain/money";
import { RemindButton } from "./remind-button";

export const metadata: Metadata = { title: "Dues & collection" };

export default async function DuesPage({ searchParams }: PageProps<"/app/fees/dues">) {
  const ctx = await requirePageContext("fees.manage");
  const sp = await searchParams;
  const { rows, today } = await ctx.db(async (sql) => {
    const today = await schoolToday(sql, ctx.schoolId);
    return { today, rows: await duesByStudent(sql, ctx.schoolId, (await currentYear(sql, ctx.schoolId)).id, today) };
  });
  const sections = [...new Map(rows.filter((r) => r.section_id).map((r) => [r.section_id!, r.section_label!])).entries()];
  const overdueCount = rows.filter((r) => r.overdue_paise > 0).length;

  return (
    <>
      <PageHeader
        title="Dues & collection"
        description="Open a student to record a counter payment (cash, UPI, cheque or bank transfer) and issue a receipt."
        actions={
          <>
            <Button asChild size="sm" variant="outline">
              <a href="/api/export/dues">
                <Download aria-hidden /> Export CSV
              </a>
            </Button>
            <RemindButton count={overdueCount} />
          </>
        }
      />
      <DataTable
        rows={rows}
        rowKey={(r) => r.student_id}
        searchParams={sp}
        defaultSort={{ key: "overdue", dir: "desc" }}
        search={{ placeholder: "Search student, admission no or phone", text: (r) => `${r.student_name} ${r.admission_no} ${r.guardian_phone ?? ""}` }}
        filters={[
          { param: "section", label: "Section", options: sections.map(([value, label]) => ({ value, label })), match: (r, v) => r.section_id === v },
          { param: "overdue", label: "Balance", options: [{ value: "1", label: "Overdue only" }, { value: "due", label: "Any balance" }, { value: "clear", label: "Fully paid" }], match: (r, v) => (v === "1" ? r.overdue_paise > 0 : v === "due" ? r.balance_paise > 0 : r.balance_paise === 0) },
        ]}
        empty={{ title: "No fees assigned yet", description: "Create fee structures in Fee setup to bill students." }}
        columns={[
          {
            key: "student",
            header: "Student",
            sort: (r) => r.student_name,
            cell: (r) => (
              <Link href={`/app/fees/students/${r.student_id}`} className="block hover:text-primary">
                <span className="font-medium">{r.student_name}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.admission_no} · {r.section_label ?? "—"}
                </span>
              </Link>
            ),
          },
          { key: "net", header: "Billed", sort: (r) => r.net_paise, align: "right", cell: (r) => formatINR(r.net_paise, { whole: true }), hideBelow: "md" },
          { key: "paid", header: "Paid", sort: (r) => r.paid_paise, align: "right", cell: (r) => formatINR(r.paid_paise, { whole: true }), hideBelow: "sm" },
          { key: "balance", header: "Balance", sort: (r) => r.balance_paise, align: "right", cell: (r) => formatINR(r.balance_paise, { whole: true }) },
          {
            key: "overdue",
            header: "Overdue",
            sort: (r) => r.overdue_paise,
            align: "right",
            cell: (r) =>
              r.overdue_paise > 0 ? (
                <span className="text-destructive">
                  {formatINR(r.overdue_paise, { whole: true })}
                  <span className="block text-xs">since {formatDate(r.oldest_due)}</span>
                </span>
              ) : r.balance_paise === 0 ? (
                <StatusBadge status="paid" />
              ) : (
                "—"
              ),
          },
          { key: "phone", header: "Guardian phone", cell: (r) => <span className="tabular text-sm">{r.guardian_phone ?? "—"}</span>, hideBelow: "lg" },
        ]}
      />
      <p className="mt-3 text-xs text-muted-foreground">Overdue means the due date has passed (today is {formatDate(today)}).</p>
    </>
  );
}
