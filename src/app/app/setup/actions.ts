"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { requireActionContext } from "@/lib/auth/context";
import { addPresetSubjects, quickClassesInput, quickSetupClasses, setupProgress } from "@/lib/data/onboarding";
import { currentYear } from "@/lib/data/school";
import { AppError } from "@/lib/errors";

export async function quickClassesAction(input: unknown): Promise<ActionResult<{ sections: number }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("academics.manage");
    const data = parseInput(quickClassesInput, input);
    const sections = await ctx.db(async (sql) => quickSetupClasses(sql, ctx.schoolId, (await currentYear(sql, ctx.schoolId)).id, data));
    revalidatePath("/app/setup");
    return ok({ sections }, `${sections} sections created`);
  });
}

export async function presetSubjectsAction(codes: string[]): Promise<ActionResult<{ added: number }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("academics.manage");
    const added = await ctx.db((sql) => addPresetSubjects(sql, ctx.schoolId, z.array(z.string().max(12)).min(1, "Choose at least one subject").parse(codes)));
    revalidatePath("/app/setup");
    return ok({ added }, `${added} subjects added`);
  });
}

export async function completeSetupAction(): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("settings.manage");
    const p = await setupProgress(ctx.userId, ctx.schoolId);
    if (!p.year || p.sections === 0 || p.subjects === 0) throw new AppError("Create the academic year, classes and subjects first.");
    await ctx.db((sql) => sql.exec("update schools set onboarding_completed_at = now(), status = 'active' where id = $1", [ctx.schoolId]));
    revalidatePath("/app", "layout");
    return ok(null, "Setup complete. Welcome to SchoolSphere!");
  });
}
