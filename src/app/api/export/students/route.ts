import { requireActionContext } from "@/lib/auth/context";
import { csvResponse, toCsv } from "@/lib/csv";
import { currentYear } from "@/lib/data/school";
import { listStudents } from "@/lib/data/students";
import { apiError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireActionContext("students.manage");
    const rows = await ctx.db(async (sql) => {
      const year = await currentYear(sql, ctx.schoolId);
      await sql.exec("select public.log_audit_event($1, 'export', 'students', null, null, 'Student CSV export')", [ctx.schoolId]);
      return listStudents(sql, ctx.schoolId, year.id);
    });
    const csv = toCsv(rows as unknown as Record<string, unknown>[], [
      { key: "admission_no", header: "admission_no" },
      { key: "full_name", header: "name" },
      { key: "section_label", header: "class_section" },
      { key: "roll_no", header: "roll_no" },
      { key: "gender", header: "gender" },
      { key: "date_of_birth", header: "date_of_birth" },
      { key: "status", header: "status" },
      { key: "guardian_name", header: "guardian_name" },
      { key: "guardian_phone", header: "guardian_phone" },
    ]);
    return csvResponse(csv, `students-${new Date().toISOString().slice(0, 10)}.csv`);
  } catch (error) {
    return apiError(error);
  }
}
