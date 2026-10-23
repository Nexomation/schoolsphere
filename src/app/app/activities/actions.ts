"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { requireActionContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { addAchievement, enrollStudent, reviewAchievement, saveActivity, saveActivityAttendance, withdrawStudent } from "@/lib/data/activities";
import { familyUserIds, notifyUsers } from "@/lib/data/notifications";
import { currentYear } from "@/lib/data/school";
import { withService } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { achievementInput, activityAttendanceInput, activityInput } from "@/lib/schemas/activities";

const refresh = () => revalidatePath("/app/activities", "layout");

export async function saveActivityAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("activities.manage");
    const data = parseInput(activityInput, input);
    if (!data.id && ctx.role !== "school_admin") throw new ForbiddenError("Only administrators create new activities.");
    const id = await ctx.db(async (sql) => saveActivity(sql, ctx.schoolId, (await currentYear(sql, ctx.schoolId)).id, data));
    refresh();
    return ok({ id }, data.id ? "Activity updated" : "Activity created");
  });
}

/** Staff enroll any student; families register their own child (RLS enforces both). */
export async function enrollAction(activityId: string, studentId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("activities.view");
    if (ctx.role === "student" || ctx.role === "accountant" || ctx.role === "transport_coordinator") throw new ForbiddenError();
    await ctx.db((sql) => enrollStudent(sql, ctx.schoolId, ctx.userId, z.uuid().parse(activityId), z.uuid().parse(studentId)));
    refresh();
    return ok(null, "Registered");
  });
}

export async function withdrawAction(activityId: string, studentId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("activities.view");
    await ctx.db((sql) => withdrawStudent(sql, z.uuid().parse(activityId), z.uuid().parse(studentId)));
    refresh();
    return ok(null, "Withdrawn from the activity");
  });
}

export async function activityAttendanceAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("activities.manage");
    const data = parseInput(activityAttendanceInput, input);
    await ctx.db((sql) => saveActivityAttendance(sql, ctx.schoolId, ctx.userId, data));
    refresh();
    return ok(null, "Session attendance saved");
  });
}

export async function addAchievementAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("achievements.submit");
    const data = parseInput(achievementInput, input);
    const staff = can(ctx.role, "achievements.verify");
    const id = await ctx.db((sql) => addAchievement(sql, ctx.schoolId, ctx.userId, staff, data));
    if (!staff) {
      // Let administrators know something is waiting for verification.
      // Families cannot read the membership list, so the recipients are looked up in the trusted context.
      const admins = await withService((sql) =>
        sql.many<{ user_id: string }>("select user_id from school_memberships where school_id = $1 and role = 'school_admin' and status = 'active'", [ctx.schoolId]),
      );
      await notifyUsers({ schoolId: ctx.schoolId, userIds: admins.map((a) => a.user_id), type: "activity", title: "Achievement awaiting verification", body: data.title, link: "/app/activities/achievements" }, ctx.userId);
    }
    refresh();
    return ok({ id }, staff ? "Achievement recorded and verified" : "Submitted for verification by the school");
  });
}

export async function reviewAchievementAction(id: string, decision: "verified" | "rejected", note: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("achievements.verify");
    const r = await ctx.db((sql) => reviewAchievement(sql, ctx.userId, z.uuid().parse(id), z.enum(["verified", "rejected"]).parse(decision), note.trim() || null));
    const families = await familyUserIds([r.student_id]);
    await notifyUsers(
      {
        schoolId: ctx.schoolId,
        userIds: families.get(r.student_id) ?? [],
        type: "activity",
        title: decision === "verified" ? `Achievement verified: ${r.title}` : `Achievement not verified: ${r.title}`,
        body: note || (decision === "verified" ? "It now appears on the development report." : "Please contact the school for details."),
        link: `/app/activities/portfolio/${r.student_id}`,
      },
      ctx.userId,
    );
    refresh();
    return ok(null, decision === "verified" ? "Achievement verified" : "Achievement rejected");
  });
}
