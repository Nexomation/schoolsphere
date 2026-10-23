"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ok, runAction, type ActionResult } from "@/lib/actions";
import { ACTIVE_MEMBERSHIP_COOKIE, getAuthContext } from "@/lib/auth/context";
import { getAuthProvider } from "@/lib/auth/provider";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";

export async function switchMembershipAction(membershipId: string): Promise<ActionResult> {
  return runAction(async () => {
    const id = z.uuid().parse(membershipId);
    const ctx = await getAuthContext();
    // Only memberships loaded for this user (via RLS) can be activated.
    if (!ctx?.memberships.some((m) => m.id === id)) throw new AppError("That school or role is not available to you.", "forbidden");
    (await cookies()).set(ACTIVE_MEMBERSHIP_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: env().NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
    return ok(null, "Switched");
  });
}

export async function signOutAction() {
  await getAuthProvider().signOut();
  (await cookies()).delete(ACTIVE_MEMBERSHIP_COOKIE);
  redirect("/login");
}
