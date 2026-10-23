"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ok, runAction, type ActionResult } from "@/lib/actions";
import { ACTIVE_MEMBERSHIP_COOKIE } from "@/lib/auth/context";
import { getAuthProvider } from "@/lib/auth/provider";
import { acceptInvitation } from "@/lib/data/invitations";
import { withService } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/app";
}

const signInSchema = z.object({
  email: z.email("Enter a valid email address").max(200),
  password: z.string().min(1, "Enter your password").max(200),
  next: z.string().optional(),
});

export async function signInAction(input: z.input<typeof signInSchema>): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const data = signInSchema.parse(input);
    const res = await getAuthProvider().signInWithPassword(data.email, data.password);
    if (!res.ok) {
      logger.info("Sign-in failed", { email: data.email.replace(/^(.).*(@.*)$/, "$1***$2") });
      throw new AppError(res.error);
    }
    (await cookies()).delete(ACTIVE_MEMBERSHIP_COOKIE);
    return ok({ redirectTo: safeNext(data.next) }, "Signed in");
  });
}

export async function demoSignInAction(userId: string): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const config = env();
    if (!config.DEMO_MODE || config.AUTH_PROVIDER !== "local") throw new AppError("Demo sign-in is not available.", "forbidden");
    const provider = getAuthProvider();
    await provider.signInAsDemoUser!(z.uuid().parse(userId));
    (await cookies()).delete(ACTIVE_MEMBERSHIP_COOKIE);
    const isPlatform = await withService((sql) => sql.maybeOne("select 1 from platform_admins where user_id = $1", [userId]));
    return ok({ redirectTo: isPlatform ? "/platform" : "/app" }, "Signed in to demo account");
  });
}

export async function requestPasswordResetAction(input: { email: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { email } = z.object({ email: z.email("Enter a valid email address") }).parse(input);
    await getAuthProvider().requestPasswordReset(email);
    // Same response whether or not the account exists.
    return ok(null, "If an account exists for that email, a reset link is on its way.");
  });
}

const resetSchema = z
  .object({ token: z.string().optional(), password: z.string().min(10).max(128), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

export async function completePasswordResetAction(input: z.input<typeof resetSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const data = resetSchema.parse(input);
    const res = await getAuthProvider().completePasswordReset({ token: data.token, password: data.password });
    if (!res.ok) throw new AppError(res.error);
    return ok(null, "Password updated. Please sign in.");
  });
}

const acceptSchema = z
  .object({
    token: z.string().min(20),
    fullName: z.string().trim().min(2, "Enter your name").max(120),
    password: z.string().min(10, "At least 10 characters").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

export async function acceptInvitationAction(input: z.input<typeof acceptSchema>): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const data = acceptSchema.parse(input);
    const { email } = await acceptInvitation(data);
    const res = await getAuthProvider().signInWithPassword(email, data.password);
    if (!res.ok) return ok({ redirectTo: "/login" }, "Account created. Please sign in.");
    return ok({ redirectTo: "/app" }, "Welcome! Your account is ready.");
  });
}

export async function goToApp() {
  redirect("/app");
}
