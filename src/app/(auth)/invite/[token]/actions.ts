"use server";

import { ok, runAction, type ActionResult } from "@/lib/actions";
import { getAuthContext } from "@/lib/auth/context";
import { acceptInvitationAsUser } from "@/lib/data/invitations";
import { UnauthenticatedError } from "@/lib/errors";

export async function acceptInvitationAsUserAction(token: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await getAuthContext();
    if (!ctx) throw new UnauthenticatedError();
    await acceptInvitationAsUser(String(token), ctx.user);
    return ok(null, "Invitation accepted");
  });
}
