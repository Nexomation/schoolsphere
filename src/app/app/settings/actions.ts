"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { requireActionContext } from "@/lib/auth/context";
import { getAuthProvider } from "@/lib/auth/provider";
import { validateBands, type GradeBand } from "@/lib/domain/grading";
import { AppError } from "@/lib/errors";
import { brandingInput, gradeScaleInput, policyInput, schoolProfileInput } from "@/lib/schemas/settings";

export async function saveProfileAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("settings.manage");
    const d = parseInput(schoolProfileInput, input);
    await ctx.db((sql) =>
      sql.exec(
        `update schools set name = $2, board = $3, address_line1 = $4, address_line2 = $5, city = $6, district = $7, state = $8, pincode = $9,
                phone = $10, email = $11, website = $12, udise_code = $13 where id = $1`,
        [ctx.schoolId, d.name, d.board, d.addressLine1, d.addressLine2, d.city, d.district, d.state, d.pincode, d.phone, d.email, d.website, d.udiseCode],
      ),
    );
    revalidatePath("/app", "layout");
    return ok(null, "School profile saved");
  });
}

export async function saveBrandingAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("settings.manage");
    const d = parseInput(brandingInput, input);
    await ctx.db((sql) => sql.exec("update schools set branding = $2::jsonb where id = $1", [ctx.schoolId, JSON.stringify(d)]));
    revalidatePath("/app", "layout");
    return ok(null, "Branding saved");
  });
}

export async function savePolicyAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("settings.manage");
    const d = parseInput(policyInput, input);
    await ctx.db(
      (sql) =>
        sql.exec(
          `update schools set settings = settings || jsonb_build_object(
             'attendance', jsonb_build_object('workingWeekdays', $2::jsonb, 'lateCountsAsPresent', $3::boolean, 'excusedHandling', $4::text, 'lowAttendanceThreshold', $5::numeric),
             'attendanceEditWindowDays', $6::int, 'absentPolicy', $7::text, 'receiptPrefix', $8::text)
           where id = $1`,
          [ctx.schoolId, JSON.stringify([...new Set(d.workingWeekdays)].sort()), d.lateCountsAsPresent, d.excusedHandling, d.lowAttendanceThreshold, d.attendanceEditWindowDays, d.absentPolicy, d.receiptPrefix],
        ),
      { reason: "School policies updated" },
    );
    revalidatePath("/app", "layout");
    return ok(null, "Policies saved. Attendance percentages now use the new rules.");
  });
}

export async function createGradeScaleAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("settings.manage");
    const d = parseInput(gradeScaleInput, input);
    const bands: GradeBand[] = d.bands
      .map((b) => ({ minPercent: b.minPercent, grade: b.grade, ...(b.gradePoint !== "" && b.gradePoint !== undefined ? { gradePoint: b.gradePoint } : {}), ...(b.remark ? { remark: b.remark } : {}) }))
      .sort((a, b) => b.minPercent - a.minPercent);
    const problem = validateBands(bands);
    if (problem) throw new AppError(problem);
    await ctx.db(async (sql) => {
      if (d.makeDefault) await sql.exec("update grade_scales set is_default = false where school_id = $1", [ctx.schoolId]);
      await sql.exec("insert into grade_scales (school_id, name, bands, is_default) values ($1, $2, $3::jsonb, $4)", [ctx.schoolId, d.name, JSON.stringify(bands), d.makeDefault]);
    });
    revalidatePath("/app/settings/grading");
    return ok(null, "Grade scale created");
  });
}

export async function setDefaultScaleAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("settings.manage");
    await ctx.db(async (sql) => {
      await sql.exec("update grade_scales set is_default = false where school_id = $1", [ctx.schoolId]);
      await sql.exec("update grade_scales set is_default = true where id = $1 and school_id = $2", [z.uuid().parse(id), ctx.schoolId]);
    });
    revalidatePath("/app/settings/grading");
    return ok(null, "Default grade scale updated");
  });
}

export async function setMembershipStatusAction(membershipId: string, status: "active" | "suspended"): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("users.manage");
    const id = z.uuid().parse(membershipId);
    if (id === ctx.active.id && status === "suspended") throw new AppError("You cannot suspend your own access.");
    await ctx.db(async (sql) => {
      if (status === "suspended") {
        const m = await sql.one<{ role: string }>("select role from school_memberships where id = $1 and school_id = $2", [id, ctx.schoolId]);
        if (m.role === "school_admin") {
          const admins = await sql.one<{ n: number }>("select count(*)::int as n from school_memberships where school_id = $1 and role = 'school_admin' and status = 'active'", [ctx.schoolId]);
          if (admins.n <= 1) throw new AppError("A school must keep at least one active administrator.");
        }
      }
      await sql.exec("update school_memberships set status = $3 where id = $1 and school_id = $2", [id, ctx.schoolId, z.enum(["active", "suspended"]).parse(status)]);
    }, { reason: status === "suspended" ? "Access suspended" : "Access restored" });
    revalidatePath("/app/settings/users");
    return ok(null, status === "suspended" ? "Access suspended" : "Access restored");
  });
}

export async function revokeInvitationAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("users.manage");
    await ctx.db((sql) => sql.exec("update invitations set revoked_at = now() where id = $1 and school_id = $2 and accepted_at is null", [z.uuid().parse(id), ctx.schoolId]));
    revalidatePath("/app/settings/users");
    return ok(null, "Invitation revoked");
  });
}

// ------------------------------------------------------------------ own profile (any signed-in member)
export async function saveMyProfileAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext();
    const d = parseInput(z.object({ fullName: z.string().trim().min(2).max(120), phone: z.string().trim().max(20).optional(), preferredLanguage: z.enum(["en", "ta"]) }), input);
    await ctx.db((sql) => sql.exec("update user_profiles set full_name = $2, phone = $3, preferred_language = $4 where id = $1", [ctx.userId, d.fullName, d.phone || null, d.preferredLanguage]));
    revalidatePath("/app", "layout");
    return ok(null, "Profile saved");
  });
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext();
    const d = parseInput(
      z
        .object({ current: z.string().min(1), password: z.string().min(10).max(128), confirm: z.string() })
        .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" }),
      input,
    );
    const res = await getAuthProvider().changePassword(ctx.userId, d.current, d.password);
    if (!res.ok) throw new AppError(res.error);
    return ok(null, "Password changed");
  });
}
