import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireActionContext } from "@/lib/auth/context";
import { csvResponse, toCsv } from "@/lib/csv";
import { sectionMonthSummary } from "@/lib/data/attendance";
import { schoolToday } from "@/lib/data/school";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireActionContext("attendance.mark");
    const params = z
      .object({ section: z.uuid(), month: z.string().regex(/^\d{4}-\d{2}$/) })
      .parse(Object.fromEntries(request.nextUrl.searchParams));
    const rows = await ctx.db(async (sql) => {
      // RLS returns no students for a section the caller cannot see.
      const label = await sql.maybeOne<{ label: string }>(
        "select c.name || ' ' || s.name as label from sections s join classes c on c.id = s.class_id where s.id = $1",
        [params.section],
      );
      const data = await sectionMonthSummary(sql, ctx.schoolId, params.section, params.month, await schoolToday(sql, ctx.schoolId));
      return data.map((r) => ({
        section: label?.label ?? "",
        roll_no: r.rollNo,
        student: r.name,
        working_days: r.summary.workingDays,
        recorded_days: r.summary.recordedDays,
        attended: r.summary.attended,
        absent: r.summary.absent,
        late: r.summary.late,
        excused: r.summary.excused,
        not_recorded: r.summary.notRecordedDays,
        percentage: r.summary.percentage,
      }));
    });
    const columns = Object.keys(rows[0] ?? { student: "" }).map((k) => ({ key: k, header: k }));
    return csvResponse(toCsv(rows, columns), `attendance-${params.month}.csv`);
  } catch (error) {
    return apiError(error);
  }
}
