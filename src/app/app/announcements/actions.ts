"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { requireActionContext } from "@/lib/auth/context";
import { announcementInput, audienceUserIds, createAnnouncement, setAnnouncementStatus } from "@/lib/data/announcements";
import { notifyUsers } from "@/lib/data/notifications";
import { ForbiddenError } from "@/lib/errors";

async function notifyAudience(schoolId: string, userId: string, a: { title: string; body: string; audience: string; sectionId: string | null; priority: string }) {
  const users = (await audienceUserIds(schoolId, a.audience, a.sectionId)).filter((u) => u !== userId);
  await notifyUsers(
    { schoolId, userIds: users, type: "announcement", title: `${a.priority === "urgent" ? "URGENT: " : ""}${a.title}`, body: a.body.slice(0, 280), link: "/app/announcements" },
    userId,
  );
  return users.length;
}

export async function createAnnouncementAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("announcements.publish");
    const data = parseInput(announcementInput, input);
    // Teachers publish only to sections they teach; RLS enforces the same rule.
    if (ctx.role === "teacher" && data.audience !== "section") throw new ForbiddenError("Teachers can post announcements to their own sections only.");
    const id = await ctx.db((sql) => createAnnouncement(sql, ctx.schoolId, ctx.userId, data));
    let reached = 0;
    if (data.publish) reached = await notifyAudience(ctx.schoolId, ctx.userId, data);
    revalidatePath("/app/announcements");
    return ok({ id }, data.publish ? `Published and sent to ${reached} people` : "Draft saved");
  });
}

export async function publishAnnouncementAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("announcements.publish");
    const a = await ctx.db(async (sql) => {
      await setAnnouncementStatus(sql, ctx.schoolId, z.uuid().parse(id), "published");
      return sql.one<{ title: string; body: string; audience: string; section_id: string | null; priority: string }>("select title, body, audience, section_id, priority from announcements where id = $1", [id]);
    });
    await notifyAudience(ctx.schoolId, ctx.userId, { ...a, sectionId: a.section_id });
    revalidatePath("/app/announcements");
    return ok(null, "Published");
  });
}

export async function archiveAnnouncementAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("announcements.publish");
    await ctx.db((sql) => setAnnouncementStatus(sql, ctx.schoolId, z.uuid().parse(id), "archived"));
    revalidatePath("/app/announcements");
    return ok(null, "Archived");
  });
}
