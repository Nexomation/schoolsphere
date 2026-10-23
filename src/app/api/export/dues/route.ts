import { apiError } from "@/lib/api";
import { requireActionContext } from "@/lib/auth/context";
import { csvResponse, toCsv } from "@/lib/csv";
import { duesByStudent } from "@/lib/data/fees";
import { currentYear, schoolToday } from "@/lib/data/school";
import { paiseToRupeeString } from "@/lib/domain/money";

export async function GET() {
  try {
    const ctx = await requireActionContext("fees.manage");
    const rows = await ctx.db(async (sql) => {
      await sql.exec("select public.log_audit_event($1, 'export', 'fee_dues', null, null, 'Dues CSV export')", [ctx.schoolId]);
      return duesByStudent(sql, ctx.schoolId, (await currentYear(sql, ctx.schoolId)).id, await schoolToday(sql, ctx.schoolId));
    });
    const data = rows.map((r) => ({
      admission_no: r.admission_no,
      student: r.student_name,
      class_section: r.section_label,
      billed_inr: paiseToRupeeString(r.net_paise),
      paid_inr: paiseToRupeeString(r.paid_paise),
      balance_inr: paiseToRupeeString(r.balance_paise),
      overdue_inr: paiseToRupeeString(r.overdue_paise),
      oldest_overdue_due_date: r.oldest_due,
      guardian_phone: r.guardian_phone,
    }));
    return csvResponse(toCsv(data, Object.keys(data[0] ?? { student: "" }).map((k) => ({ key: k, header: k }))), `fee-dues-${new Date().toISOString().slice(0, 10)}.csv`);
  } catch (error) {
    return apiError(error);
  }
}
