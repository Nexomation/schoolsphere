"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { requireActionContext } from "@/lib/auth/context";
import { assignmentInput, getAssignment, gradeSubmission, grantExtension, returnSubmission, saveAssignment, submitWork } from "@/lib/data/homework";
import { familyUserIds, notifyUsers } from "@/lib/data/notifications";
import { myStaffId } from "@/lib/data/school";
import { formatDateTime } from "@/lib/domain/dates";
import { AppError } from "@/lib/errors";
import { storage } from "@/lib/storage";

async function sectionStudentIds(ctx: Awaited<ReturnType<typeof requireActionContext>>, sectionId: string) {
  return ctx.db(async (sql) =>
    (await sql.many<{ student_id: string }>("select student_id from enrollments where section_id = $1 and status = 'active'", [sectionId])).map((r) => r.student_id),
  );
}

export async function saveAssignmentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("homework.manage");
    const data = parseInput(assignmentInput, input);
    const { id, isNew, title } = await ctx.db(async (sql) => {
      const staffId = await myStaffId(sql, ctx.schoolId, ctx.userId);
      const r = await saveAssignment(sql, ctx.schoolId, staffId, data);
      const a = await getAssignment(sql, r.id);
      return { ...r, title: `${a.subject_name}: ${a.title}`, due: a.due_at };
    });
    if (isNew) {
      const families = await familyUserIds(await sectionStudentIds(ctx, data.sectionId));
      await notifyUsers(
        {
          schoolId: ctx.schoolId,
          userIds: [...families.values()].flat(),
          type: "homework",
          title: `New homework — ${title}`,
          body: `Due ${formatDateTime(new Date(`${data.dueAt}:00+05:30`).toISOString())}.`,
          link: `/app/homework/${id}`,
        },
        ctx.userId,
      );
    }
    revalidatePath("/app/homework");
    return ok({ id }, data.id ? "Assignment updated" : data.publish ? "Assignment published to students and parents" : "Draft saved");
  });
}

export async function gradeSubmissionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("homework.manage");
    const data = parseInput(
      z.object({
        assignmentId: z.uuid(),
        submissionId: z.uuid(),
        marks: z.union([z.literal(""), z.coerce.number().min(0)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
        feedback: z.string().trim().max(5000).optional().transform((v) => v || null),
        action: z.enum(["grade", "return"]).default("grade"),
      }),
      input,
    );
    const student = await ctx.db(async (sql) => {
      if (data.action === "return") {
        if (!data.feedback) throw new AppError("Tell the student what to improve before returning the work.");
        await returnSubmission(sql, data.submissionId, data.feedback);
      } else {
        await gradeSubmission(sql, ctx.userId, { submissionId: data.submissionId, marks: data.marks, feedback: data.feedback });
      }
      return sql.one<{ student_id: string; title: string }>(
        "select s.student_id, a.title from assignment_submissions s join assignments a on a.id = s.assignment_id where s.id = $1",
        [data.submissionId],
      );
    });
    const families = await familyUserIds([student.student_id]);
    await notifyUsers(
      {
        schoolId: ctx.schoolId,
        userIds: families.get(student.student_id) ?? [],
        type: "homework",
        title: data.action === "return" ? `Homework returned for changes: ${student.title}` : `Homework reviewed: ${student.title}`,
        body: data.feedback ?? "The teacher has reviewed the submission.",
        link: `/app/homework/${data.assignmentId}`,
      },
      ctx.userId,
    );
    revalidatePath(`/app/homework/${data.assignmentId}`);
    return ok(null, data.action === "return" ? "Returned to the student" : "Feedback saved");
  });
}

export async function grantExtensionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("homework.manage");
    const data = parseInput(
      z.object({
        assignmentId: z.uuid(),
        studentId: z.uuid(),
        until: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Choose a date and time"),
        reason: z.string().trim().min(3, "Give a short reason").max(300),
      }),
      input,
    );
    await ctx.db((sql) => grantExtension(sql, ctx.schoolId, ctx.userId, data));
    revalidatePath(`/app/homework/${data.assignmentId}`);
    return ok(null, "Deadline extended for this student");
  });
}

export async function sendReminderAction(assignmentId: string): Promise<ActionResult<{ sent: number }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("homework.manage");
    const { pending, title } = await ctx.db(async (sql) => {
      const a = await getAssignment(sql, z.uuid().parse(assignmentId));
      const rows = await sql.many<{ student_id: string }>(
        `select e.student_id from enrollments e where e.section_id = $1 and e.status = 'active'
         and not exists (select 1 from assignment_submissions s where s.assignment_id = $2 and s.student_id = e.student_id)`,
        [a.section_id, a.id],
      );
      return { pending: rows.map((r) => r.student_id), title: `${a.subject_name}: ${a.title}`, due: a.due_at };
    });
    const families = await familyUserIds(pending);
    const users = [...families.values()].flat();
    await notifyUsers({ schoolId: ctx.schoolId, userIds: users, type: "homework", title: `Reminder: ${title}`, body: "This homework has not been submitted yet.", link: `/app/homework/${assignmentId}` }, ctx.userId);
    return ok({ sent: pending.length }, `Reminder sent for ${pending.length} student${pending.length === 1 ? "" : "s"}`);
  });
}

export async function submitWorkAction(input: unknown): Promise<ActionResult<{ submissionId: string }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("homework.submit");
    const data = parseInput(z.object({ assignmentId: z.uuid(), content: z.string().trim().max(20000) }), input);
    const submissionId = await ctx.db(async (sql) => {
      const me = await sql.maybeOne<{ id: string }>("select id from students where user_id = $1 and school_id = $2", [ctx.userId, ctx.schoolId]);
      if (!me) throw new AppError("Your login is not linked to a student record.", "forbidden");
      return submitWork(sql, ctx.schoolId, me.id, data.assignmentId, data.content);
    });
    revalidatePath(`/app/homework/${data.assignmentId}`);
    return ok({ submissionId }, "Submitted");
  });
}

export async function deleteFileAction(fileId: string, path: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext();
    // RLS limits deletion to rows the user can see; only the uploader may remove a file.
    const rows = await ctx.db((sql) =>
      sql.many<{ storage_path: string }>("delete from file_objects where id = $1 and uploaded_by = $2 returning storage_path", [z.uuid().parse(fileId), ctx.userId]),
    );
    if (!rows.length) throw new AppError("File not found", "not_found");
    await storage().remove(rows[0].storage_path);
    revalidatePath(path);
    return ok(null, "File removed");
  });
}
