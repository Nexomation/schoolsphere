"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { requireActionContext } from "@/lib/auth/context";
import { approveRemark, createExam, getExam, saveMarks, saveRemark, setExamStatus } from "@/lib/data/exams";
import { familyUserIds, notifyUsers } from "@/lib/data/notifications";
import { currentYear } from "@/lib/data/school";
import { examInput, marksEntryInput, remarkInput } from "@/lib/schemas/exams";

export async function createExamAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("exams.manage");
    const data = parseInput(examInput, input);
    const id = await ctx.db(async (sql) => createExam(sql, ctx.schoolId, (await currentYear(sql, ctx.schoolId)).id, data));
    revalidatePath("/app/exams");
    return ok({ id }, "Examination scheduled. Teachers can now enter marks.");
  });
}

export async function setExamStatusAction(examId: string, status: "scheduled" | "marks_entry" | "published"): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("exams.manage");
    const id = z.uuid().parse(examId);
    const target = z.enum(["scheduled", "marks_entry", "published"]).parse(status);
    const { exam, students } = await ctx.db(
      async (sql) => {
        await setExamStatus(sql, ctx.schoolId, ctx.userId, id, target);
        const exam = await getExam(sql, id);
        const students = await sql.many<{ student_id: string }>(
          `select e.student_id from enrollments e join sections sec on sec.id = e.section_id
           where sec.class_id = $1 and sec.academic_year_id = $2 and e.status = 'active'`,
          [exam.class_id, exam.academic_year_id],
        );
        return { exam, students: students.map((s) => s.student_id) };
      },
      { reason: target === "published" ? "Results published" : "Results withdrawn for correction" },
    );
    if (target === "published") {
      const families = await familyUserIds(students);
      await notifyUsers(
        {
          schoolId: ctx.schoolId,
          userIds: [...families.values()].flat(),
          type: "marks",
          title: `${exam.name} results published`,
          body: `Results for ${exam.class_name} are now available, with the report card.`,
          link: "/app/exams",
        },
        ctx.userId,
      );
    }
    revalidatePath(`/app/exams/${id}`);
    revalidatePath("/app/exams");
    return ok(null, target === "published" ? "Results published and families notified" : "Examination reopened for marks entry");
  });
}

export async function saveMarksAction(input: unknown): Promise<ActionResult<{ saved: number }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("marks.enter");
    const data = parseInput(marksEntryInput, input);
    const saved = await ctx.db((sql) => saveMarks(sql, ctx, data), { reason: data.correctionReason || undefined });
    revalidatePath("/app/exams");
    return ok({ saved }, saved ? `Saved marks for ${saved} student${saved === 1 ? "" : "s"}` : "No changes to save");
  });
}

export async function saveRemarkAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("marks.enter");
    const data = parseInput(remarkInput, input);
    await ctx.db((sql) => saveRemark(sql, ctx.schoolId, ctx.userId, data, "human"));
    revalidatePath(`/app/exams/report-card/${data.studentId}`);
    return ok(null, "Remark saved");
  });
}

export async function approveRemarkAction(examinationId: string, studentId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("marks.enter");
    await ctx.db((sql) => approveRemark(sql, ctx.userId, z.uuid().parse(examinationId), z.uuid().parse(studentId)));
    revalidatePath(`/app/exams/report-card/${studentId}`);
    return ok(null, "Remark approved and visible to the family");
  });
}
