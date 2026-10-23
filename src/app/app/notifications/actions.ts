"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { requireActionContext } from "@/lib/auth/context";
import { NOTIFICATION_TYPES } from "@/lib/data/notifications";

// RLS restricts every statement below to the caller's own notifications.

export async function markReadAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext();
    await ctx.db((sql) => sql.exec("update notifications set read_at = now() where id = $1 and user_id = $2 and read_at is null", [z.uuid().parse(id), ctx.userId]));
    revalidatePath("/app", "layout");
    return ok(null, "Marked as read");
  });
}

export async function markAllReadAction(): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext();
    await ctx.db((sql) => sql.exec("update notifications set read_at = now() where user_id = $1 and read_at is null", [ctx.userId]));
    revalidatePath("/app", "layout");
    return ok(null, "All caught up");
  });
}

export async function savePreferencesAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext();
    const prefs = parseInput(
      z.array(z.object({ type: z.enum(NOTIFICATION_TYPES), inApp: z.boolean(), email: z.boolean(), push: z.boolean(), whatsapp: z.boolean() })),
      input,
    );
    await ctx.db(async (sql) => {
      for (const p of prefs) {
        await sql.exec(
          `insert into notification_preferences (user_id, type, in_app, email, push, whatsapp, updated_at) values ($1, $2, $3, $4, $5, $6, now())
           on conflict (user_id, type) do update set in_app = excluded.in_app, email = excluded.email, push = excluded.push, whatsapp = excluded.whatsapp, updated_at = now()`,
          [ctx.userId, p.type, p.inApp, p.email, p.push, p.whatsapp],
        );
      }
    });
    revalidatePath("/app/notifications");
    return ok(null, "Preferences saved");
  });
}
