"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { requireActionContext } from "@/lib/auth/context";
import { saveAttendance, studentsByIds } from "@/lib/data/attendance";
import { familyUserIds, notifyUsers } from "@/lib/data/notifications";
import { schoolToday } from "@/lib/data/school";
import { formatDate } from "@/lib/domain/dates";
import { isoDate, optionalUuid, uuid } from "@/lib/schemas/common";

const markSchema = z.object({
  sectionId: uuid,
  subjectId: optionalUuid,
  date: isoDate,
  entries: z
    .array(
      z.object({
        studentId: uuid,
        status: z.enum(["present", "absent", "late", "excused"]),
        remarks: z
          .string()
          .trim()
          .max(300)
          .optional()
          .transform((v) => v || null),
      }),
    )
    .min(1),
  correctionReason: z.string().trim().max(300).optional(),
});

export async function saveAttendanceAction(input: unknown): Promise<ActionResult<{ inserted: number; updated: number }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("attendance.mark");
    const data = parseInput(markSchema, input);
    const result = await ctx.db(
      async (sql) => {
        const today = await schoolToday(sql, ctx.schoolId);
        const r = await saveAttendance(sql, ctx, { ...data, subjectId: data.subjectId }, today);
        return { ...r, names: await studentsByIds(sql, r.absentStudentIds) };
      },
      { reason: data.correctionReason || undefined },
    );

    // Daily attendance only: tell families their child was marked absent.
    if (!data.subjectId && result.absentStudentIds.length) {
      const families = await familyUserIds(result.absentStudentIds);
      for (const s of result.names) {
        const users = families.get(s.id) ?? [];
        if (users.length) {
          await notifyUsers(
            {
              schoolId: ctx.schoolId,
              userIds: users,
              type: "attendance",
              title: `${s.first_name} was marked absent`,
              body: `${s.first_name} was marked absent on ${formatDate(data.date)}. Please contact the class teacher if this is incorrect.`,
              link: `/app/attendance?child=${s.id}`,
            },
            ctx.userId,
          );
        }
      }
    }
    revalidatePath("/app/attendance");
    const msg = result.inserted && !result.updated ? `Attendance saved for ${result.inserted} students` : result.updated ? `${result.updated} record${result.updated === 1 ? "" : "s"} corrected` : "No changes to save";
    return ok({ inserted: result.inserted, updated: result.updated }, msg);
  });
}
