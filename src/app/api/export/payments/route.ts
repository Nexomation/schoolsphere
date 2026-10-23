import { type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireActionContext } from "@/lib/auth/context";
import { csvResponse, toCsv } from "@/lib/csv";
import { listPayments } from "@/lib/data/fees";
import { paiseToRupeeString } from "@/lib/domain/money";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireActionContext("fees.manage");
    const q = z
      .object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .parse(Object.fromEntries(request.nextUrl.searchParams));
    const rows = await ctx.db(async (sql) => {
      await sql.exec("select public.log_audit_event($1, 'export', 'payments', null, $2::jsonb, 'Payments CSV export')", [ctx.schoolId, JSON.stringify(q)]);
      return listPayments(sql, ctx.schoolId, q);
    });
    const data = rows.map((r) => ({
      receipt_no: r.receipt_no,
      paid_at: r.paid_at,
      student: r.student_name,
      admission_no: r.admission_no,
      class_section: r.section_label,
      amount_inr: paiseToRupeeString(r.amount_paise),
      method: r.method,
      channel: r.mode,
      reference_no: r.reference_no,
      status: r.status,
      recorded_by: r.recorded_by_name,
      void_reason: r.void_reason,
    }));
    return csvResponse(toCsv(data, Object.keys(data[0] ?? { receipt_no: "" }).map((k) => ({ key: k, header: k }))), `payments-${q.from}-to-${q.to}.csv`);
  } catch (error) {
    return apiError(error);
  }
}
