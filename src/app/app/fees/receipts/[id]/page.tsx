import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { PrintButton } from "@/components/print-button";
import { humanize } from "@/components/status-badge";
import { requirePageContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getPaymentForReceipt } from "@/lib/data/fees";
import { schoolProfile } from "@/lib/data/school";
import { formatDateTime } from "@/lib/domain/dates";
import { formatINR } from "@/lib/domain/money";
import { voidPaymentAction } from "../../actions";

export const metadata: Metadata = { title: "Receipt" };

/** Indian-English amount in words, e.g. 1,25,000 -> "One lakh twenty-five thousand rupees only". */
function inWords(paise: number) {
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? `-${ones[n % 10]}` : ""}`);
  const three = (n: number) => (n >= 100 ? `${ones[Math.floor(n / 100)]} hundred${n % 100 ? ` ${two(n % 100)}` : ""}` : two(n));
  const words = (n: number): string => {
    if (n === 0) return "zero";
    const parts: string[] = [];
    const crore = Math.floor(n / 1_00_00_000);
    const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
    const thousand = Math.floor((n % 1_00_000) / 1000);
    const rest = n % 1000;
    if (crore) parts.push(`${words(crore)} crore`);
    if (lakh) parts.push(`${two(lakh)} lakh`);
    if (thousand) parts.push(`${two(thousand)} thousand`);
    if (rest) parts.push(three(rest));
    return parts.join(" ");
  };
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  const s = `${words(rupees)} rupees${p ? ` and ${two(p)} paise` : ""} only`;
  return s[0].toUpperCase() + s.slice(1);
}

export default async function ReceiptPage({ params }: PageProps<"/app/fees/receipts/[id]">) {
  const ctx = await requirePageContext("fees.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await ctx.db(async (sql) => {
    const r = await getPaymentForReceipt(sql, id);
    return r ? { ...r, school: await schoolProfile(sql, ctx.schoolId) } : null;
  });
  if (!d) notFound();
  const { payment: p, allocations, school } = d;
  const voided = p.status === "voided";
  const sandbox = p.mode === "sandbox";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <Link href={can(ctx.role, "fees.manage") ? `/app/fees/students/${p.student_id}` : "/app/fees"} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <div className="flex gap-2">
          {can(ctx.role, "payments.record") && p.status === "captured" && p.mode === "offline" && (
            <ConfirmAction
              action={voidPaymentAction.bind(null, p.id)}
              title={`Void receipt ${p.receipt_no}?`}
              description="Use this only for a receipt issued in error (e.g. a bounced cheque). The receipt stays on record marked VOID and the balance is restored."
              confirmLabel="Void receipt"
              variant="destructive"
              requireReason
            />
          )}
          <PrintButton />
        </div>
      </div>
      <article className="print-sheet relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        {(voided || sandbox) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <span className="-rotate-12 text-6xl font-black tracking-widest text-destructive/15 sm:text-7xl">{voided ? "VOID" : "SANDBOX"}</span>
          </div>
        )}
        <header className="flex flex-col gap-1 border-b pb-4 text-center">
          <h1 className="text-lg font-bold">{school.name}</h1>
          <p className="text-xs text-muted-foreground">{[school.address_line1, school.city, school.pincode].filter(Boolean).join(", ")}{school.phone ? ` · ${school.phone}` : ""}</p>
          <p className="mt-2 text-sm font-semibold tracking-wide uppercase">Fee receipt</p>
        </header>
        {sandbox && (
          <p className="mt-4 rounded-md bg-warning/10 p-2 text-center text-xs font-medium text-warning">
            Sandbox transaction — simulated in a demo school. No money was transferred. Not valid as a payment record.
          </p>
        )}
        {voided && (
          <p className="mt-4 rounded-md bg-destructive/10 p-2 text-center text-xs font-medium text-destructive">
            Voided {formatDateTime(p.voided_at)} — {p.void_reason}
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Receipt no</dt>
            <dd className="font-semibold">{p.receipt_no}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Date</dt>
            <dd>{formatDateTime(p.paid_at)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Student</dt>
            <dd className="font-medium">{p.student_name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Class · Admission no</dt>
            <dd>
              {p.section_label ?? "—"} · {p.admission_no}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Payment method</dt>
            <dd>
              {humanize(p.method)}
              {p.reference_no && <span className="block text-xs text-muted-foreground">Ref: {p.reference_no}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Academic year</dt>
            <dd>{p.year}</dd>
          </div>
        </dl>
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1.5 font-medium">Particulars</th>
              <th className="py-1.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((a, i) => (
              <tr key={i} className="border-b">
                <td className="py-1.5">{a.description}</td>
                <td className="py-1.5 text-right tabular">{formatINR(a.amount_paise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="py-2">Total received</td>
              <td className="py-2 text-right tabular">{formatINR(p.amount_paise)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-2 text-sm">{inWords(p.amount_paise)}.</p>
        {p.notes && !sandbox && <p className="mt-2 text-xs text-muted-foreground">Note: {p.notes}</p>}
        <footer className="mt-10 flex items-end justify-between text-xs text-muted-foreground">
          <span>{p.recorded_by_name ? `Received by ${p.recorded_by_name}` : p.mode === "gateway" ? "Paid online (verified with the payment gateway)" : ""}</span>
          <span className="border-t px-6 pt-1">Authorised signatory</span>
        </footer>
        <p className="mt-6 text-center text-[11px] text-muted-foreground">This is a computer-generated receipt.</p>
      </article>
    </div>
  );
}
