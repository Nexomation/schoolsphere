import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, humanize } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { UrlDateInput } from "@/components/url-date-input";
import { requirePageContext } from "@/lib/auth/context";
import { listPayments } from "@/lib/data/fees";
import { schoolToday } from "@/lib/data/school";
import { formatDateTime, monthRange } from "@/lib/domain/dates";
import { formatINR } from "@/lib/domain/money";

export const metadata: Metadata = { title: "Payments" };

const valid = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function PaymentsPage({ searchParams }: PageProps<"/app/fees/payments">) {
  const ctx = await requirePageContext("fees.manage");
  const sp = await searchParams;
  const today = await ctx.db((sql) => schoolToday(sql, ctx.schoolId));
  const from = valid(sp.from) ? (sp.from as string) : monthRange(today.slice(0, 7)).from;
  const to = valid(sp.to) ? (sp.to as string) : today;
  const rows = await ctx.db((sql) => listPayments(sql, ctx.schoolId, { from, to }));
  const captured = rows.filter((r) => r.status === "captured");
  const total = captured.reduce((s, r) => s + r.amount_paise, 0);

  return (
    <>
      <PageHeader
        title="Payments"
        description={`${captured.length} captured receipts totalling ${formatINR(total)} in the selected period. Voided receipts are shown but not counted.`}
        actions={
          <Button asChild size="sm" variant="outline">
            <a href={`/api/export/payments?from=${from}&to=${to}`}>
              <Download aria-hidden /> Export CSV
            </a>
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <UrlDateInput param="from" value={from} label="From" max={today} />
        <UrlDateInput param="to" value={to} label="To" max={today} />
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        searchParams={sp}
        pageSize={30}
        search={{ placeholder: "Search receipt, student or reference", text: (r) => `${r.receipt_no} ${r.student_name} ${r.admission_no} ${r.reference_no ?? ""}` }}
        filters={[
          { param: "method", label: "Method", options: [...new Set(rows.map((r) => r.method))].map((m) => ({ value: m, label: humanize(m) })), match: (r, v) => r.method === v },
          { param: "mode", label: "Channel", options: [{ value: "offline", label: "Counter" }, { value: "gateway", label: "Online" }, { value: "sandbox", label: "Sandbox" }], match: (r, v) => r.mode === v },
        ]}
        empty={{ title: "No payments in this period" }}
        columns={[
          {
            key: "receipt",
            header: "Receipt",
            sort: (r) => r.receipt_no,
            cell: (r) => (
              <Link href={`/app/fees/receipts/${r.id}`} className="font-medium hover:text-primary hover:underline">
                {r.receipt_no}
              </Link>
            ),
          },
          { key: "date", header: "Date", sort: (r) => r.paid_at, cell: (r) => <span className="text-sm whitespace-nowrap">{formatDateTime(r.paid_at)}</span> },
          { key: "student", header: "Student", sort: (r) => r.student_name, cell: (r) => <span>{r.student_name}<span className="block text-xs text-muted-foreground">{r.section_label}</span></span> },
          { key: "method", header: "Method", cell: (r) => <span>{humanize(r.method)}{r.reference_no && <span className="block text-xs text-muted-foreground">{r.reference_no}</span>}</span>, hideBelow: "md" },
          { key: "by", header: "Recorded by", cell: (r) => r.recorded_by_name ?? (r.mode === "offline" ? "—" : "Online"), hideBelow: "lg" },
          { key: "status", header: "Status", cell: (r) => <span className="flex gap-1"><StatusBadge status={r.status} />{r.mode === "sandbox" && <StatusBadge status="sandbox" />}</span>, hideBelow: "sm" },
          { key: "amount", header: "Amount", sort: (r) => r.amount_paise, align: "right", cell: (r) => <span className={r.status !== "captured" ? "line-through" : ""}>{formatINR(r.amount_paise)}</span> },
        ]}
        defaultSort={{ key: "date", dir: "desc" }}
      />
    </>
  );
}
