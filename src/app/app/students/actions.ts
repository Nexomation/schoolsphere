"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { requireActionContext } from "@/lib/auth/context";
import { parseCsv } from "@/lib/csv";
import { createInvitation, invitationSchema } from "@/lib/data/invitations";
import { currentYear } from "@/lib/data/school";
import {
  admitStudent,
  changeStudentStatus,
  importStudents,
  linkGuardian,
  promoteStudents,
  removeGuardianLink,
  setLinkVerified,
  updateStudent,
  validateStudentImport,
  type ImportRowResult,
} from "@/lib/data/students";
import { AppError } from "@/lib/errors";
import { admissionInput, linkGuardianInput, promotionInput, statusChangeInput, studentUpdateInput } from "@/lib/schemas/students";

export async function admitStudentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("students.manage");
    const data = parseInput(admissionInput, input);
    const id = await ctx.db((sql) => admitStudent(sql, ctx.schoolId, ctx.userId, data));
    revalidatePath("/app/students");
    return ok({ id }, `${data.firstName} has been admitted`);
  });
}

export async function updateStudentAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("students.manage");
    const data = parseInput(studentUpdateInput, input);
    await ctx.db((sql) => updateStudent(sql, ctx.schoolId, data.id, data));
    revalidatePath(`/app/students/${data.id}`);
    return ok(null, "Student details updated");
  });
}

export async function changeStudentStatusAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("students.manage");
    const data = parseInput(statusChangeInput, input);
    await ctx.db((sql) => changeStudentStatus(sql, ctx.schoolId, data), { reason: data.reason });
    revalidatePath(`/app/students/${data.studentId}`);
    revalidatePath("/app/students");
    return ok(null, data.status === "active" ? "Student re-activated" : `Student marked as ${data.status}`);
  });
}

export async function linkGuardianAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("students.manage");
    const data = parseInput(linkGuardianInput, input);
    await ctx.db((sql) => linkGuardian(sql, ctx.schoolId, ctx.userId, data));
    revalidatePath(`/app/students/${data.studentId}`);
    return ok(null, "Guardian linked");
  });
}

export async function setGuardianVerifiedAction(studentId: string, linkId: string, verified: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("guardians.verify");
    await ctx.db((sql) => setLinkVerified(sql, ctx.schoolId, ctx.userId, z.uuid().parse(linkId), verified));
    revalidatePath(`/app/students/${studentId}`);
    return ok(null, verified ? "Guardian link verified. The parent can now see this child." : "Verification removed");
  });
}

export async function removeGuardianLinkAction(studentId: string, linkId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("students.manage");
    await ctx.db((sql) => removeGuardianLink(sql, ctx.schoolId, z.uuid().parse(linkId)));
    revalidatePath(`/app/students/${studentId}`);
    return ok(null, "Guardian unlinked");
  });
}

export async function inviteUserAction(input: unknown): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("users.manage");
    const data = parseInput(invitationSchema, input);
    const res = await createInvitation(ctx, data);
    revalidatePath("/app/settings/users");
    return ok({ link: res.link, emailed: res.emailed }, res.emailed ? `Invitation emailed to ${data.email}` : "Invitation created");
  });
}

export async function promoteStudentsAction(input: unknown): Promise<ActionResult<{ moved: number }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("students.manage");
    const data = parseInput(promotionInput, input);
    if (data.fromSectionId === data.toSectionId) throw new AppError("Choose a different target section");
    const moved = await ctx.db((sql) => promoteStudents(sql, ctx.schoolId, data), { reason: "Promotion / section change" });
    revalidatePath("/app/students");
    return ok({ moved }, `${moved} student${moved === 1 ? "" : "s"} moved`);
  });
}

const MAX_IMPORT_ROWS = 2000;

export async function previewImportAction(csv: string): Promise<ActionResult<{ results: ImportRowResult[]; validCount: number; missingColumns: string[] }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("students.manage");
    if (typeof csv !== "string" || csv.length > 2_000_000) throw new AppError("The file is too large (2 MB maximum).");
    const parsed = parseCsv(csv);
    const required = ["admission_no", "first_name", "date_of_birth", "gender", "class", "section", "guardian_name", "guardian_phone"];
    const missingColumns = required.filter((c) => !parsed.headers.includes(c));
    if (missingColumns.length) return ok({ results: [] as ImportRowResult[], validCount: 0, missingColumns });
    if (parsed.rows.length > MAX_IMPORT_ROWS) throw new AppError(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`);
    const { results, valid } = await ctx.db(async (sql) => validateStudentImport(sql, ctx.schoolId, (await currentYear(sql, ctx.schoolId)).id, parsed.rows));
    return ok({ results, validCount: valid.length, missingColumns: [] });
  });
}

export async function commitImportAction(csv: string): Promise<ActionResult<{ imported: number }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("students.manage");
    const parsed = parseCsv(String(csv));
    if (parsed.rows.length > MAX_IMPORT_ROWS) throw new AppError(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`);
    // Re-validated on the server; valid rows are imported together in one transaction.
    const imported = await ctx.db(
      async (sql) => {
        const { valid } = await validateStudentImport(sql, ctx.schoolId, (await currentYear(sql, ctx.schoolId)).id, parsed.rows);
        if (valid.length === 0) throw new AppError("There are no valid rows to import.");
        return importStudents(sql, ctx.schoolId, ctx.userId, valid);
      },
      { reason: "CSV import" },
    );
    revalidatePath("/app/students");
    return ok({ imported }, `${imported} students imported`);
  });
}
