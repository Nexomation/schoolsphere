"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { getAuthContext } from "@/lib/auth/context";
import { onboardSchool, onboardSchoolInput } from "@/lib/data/onboarding";
import { withUser } from "@/lib/db";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";

async function requirePlatform() {
  const ctx = await getAuthContext();
  if (!ctx) throw new UnauthenticatedError();
  if (!ctx.isPlatformAdmin) throw new ForbiddenError();
  return ctx;
}

export async function onboardSchoolAction(input: unknown): Promise<ActionResult<{ inviteLink: string }>> {
  return runAction(async () => {
    const ctx = await requirePlatform();
    const data = parseInput(onboardSchoolInput, input);
    const r = await onboardSchool(ctx.user.id, data);
    revalidatePath("/platform");
    return ok({ inviteLink: r.inviteLink }, `${data.name} created. Send the invitation link to the principal.`);
  });
}

/** Suspending a school blocks every member's access (RLS checks school status) without deleting data. */
export async function setSchoolStatusAction(schoolId: string, status: "active" | "suspended"): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePlatform();
    await withUser({ userId: ctx.user.id, reason: `School ${status}` }, (sql) =>
      sql.exec("update schools set status = $2 where id = $1", [z.uuid().parse(schoolId), z.enum(["active", "suspended"]).parse(status)]),
    );
    revalidatePath("/platform");
    return ok(null, status === "suspended" ? "School suspended" : "School re-activated");
  });
}

export async function setDemoRequestStatusAction(id: string, status: "contacted" | "converted" | "closed"): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePlatform();
    await withUser({ userId: ctx.user.id }, (sql) => sql.exec("update demo_requests set status = $2 where id = $1", [z.uuid().parse(id), z.enum(["contacted", "converted", "closed"]).parse(status)]));
    revalidatePath("/platform");
    return ok(null, "Updated");
  });
}
