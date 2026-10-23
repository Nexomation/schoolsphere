import "server-only";
import { z } from "zod";
import { createToken, hashToken } from "../auth/password";
import { getAuthProvider } from "../auth/provider";
import type { SchoolContext } from "../auth/context";
import { ROLES, type Role } from "../auth/permissions";
import { withService } from "../db";
import { env } from "../env";
import { AppError } from "../errors";
import { CHANNEL_PROVIDERS } from "../notifications/channels";
import { logger } from "../logger";

const INVITE_DAYS = 7;

export const invitationSchema = z.object({
  email: z.email("Enter a valid email address").max(200).transform((v) => v.toLowerCase()),
  fullName: z.string().trim().min(2, "Enter the person's name").max(120),
  role: z.enum(ROLES),
  staffId: z.uuid().optional().or(z.literal("")).transform((v) => v || undefined),
  guardianId: z.uuid().optional().or(z.literal("")).transform((v) => v || undefined),
  studentId: z.uuid().optional().or(z.literal("")).transform((v) => v || undefined),
});
export type InvitationInput = z.output<typeof invitationSchema>;

/**
 * Creates an invitation (admin only — enforced by RLS on `invitations` and by
 * the calling action). Returns the one-time link. The link is emailed when an
 * email provider is configured; otherwise the admin shares it manually.
 */
export async function createInvitation(ctx: SchoolContext, input: InvitationInput) {
  const { token, hash } = createToken();
  const row = await ctx.db(async (sql) => {
    // Linked records must belong to this school; RLS makes foreign rows invisible.
    if (input.staffId) await sql.one("select id from staff where id = $1 and school_id = $2", [input.staffId, ctx.schoolId]);
    if (input.guardianId) await sql.one("select id from guardians where id = $1 and school_id = $2", [input.guardianId, ctx.schoolId]);
    if (input.studentId) await sql.one("select id from students where id = $1 and school_id = $2", [input.studentId, ctx.schoolId]);
    const existing = await sql.maybeOne(
      `select 1 from school_memberships m join user_profiles p on p.id = m.user_id
       where m.school_id = $1 and lower(p.email) = $2 and m.role = $3`,
      [ctx.schoolId, input.email, input.role],
    );
    if (existing) throw new AppError("This person already has that role in your school.", "conflict");
    await sql.exec(
      "update invitations set revoked_at = now() where school_id = $1 and lower(email) = $2 and role = $3 and accepted_at is null and revoked_at is null",
      [ctx.schoolId, input.email, input.role],
    );
    return sql.one<{ id: string }>(
      `insert into invitations (school_id, email, full_name, role, staff_id, guardian_id, student_id, token_hash, expires_at, invited_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(days => $9), $10) returning id`,
      [ctx.schoolId, input.email, input.fullName, input.role, input.staffId ?? null, input.guardianId ?? null, input.studentId ?? null, hash, INVITE_DAYS, ctx.userId],
    );
  });
  const link = `${env().APP_URL}/invite/${token}`;
  let emailed = false;
  const email = CHANNEL_PROVIDERS.email;
  if (email.configured() && env().NOTIFICATIONS_EXTERNAL_ENABLED) {
    try {
      await email.send({
        to: input.email,
        title: `You're invited to ${ctx.active.schoolName}`,
        body: `${ctx.user.fullName} invited you to join ${ctx.active.schoolName} on SchoolSphere. Accept within ${INVITE_DAYS} days: ${link}`,
      });
      emailed = true;
    } catch (error) {
      logger.warn("Invitation email failed", { error });
    }
  }
  return { id: row.id, link, emailed };
}

export type InvitationPreview = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  schoolName: string;
  expired: boolean;
  usable: boolean;
};

/** Public lookup for the /invite page. Reveals only what the link holder needs. */
export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  const row = await withService((sql) =>
    sql.maybeOne<{ id: string; email: string; full_name: string; role: Role; name: string; expires_at: string; accepted_at: string | null; revoked_at: string | null }>(
      `select i.id, i.email, i.full_name, i.role, s.name, i.expires_at, i.accepted_at, i.revoked_at
       from invitations i join schools s on s.id = i.school_id where i.token_hash = $1`,
      [hashToken(token)],
    ),
  );
  if (!row) return null;
  const expired = new Date(row.expires_at) < new Date();
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    schoolName: row.name,
    expired,
    usable: !expired && !row.accepted_at && !row.revoked_at,
  };
}

async function completeAcceptance(token: string, userId: string, fullName: string, email: string) {
  return withService(
    async (sql) => {
      const inv = await sql.maybeOne<{
        id: string;
        school_id: string;
        email: string;
        role: Role;
        staff_id: string | null;
        guardian_id: string | null;
        student_id: string | null;
        invited_by: string | null;
      }>(
        `update invitations set accepted_at = now(), accepted_user_id = $2
         where token_hash = $1 and accepted_at is null and revoked_at is null and expires_at > now()
         returning id, school_id, email, role, staff_id, guardian_id, student_id, invited_by`,
        [hashToken(token), userId],
      );
      if (!inv) throw new AppError("This invitation is no longer valid. Ask your school to send a new one.");
      if (inv.email.toLowerCase() !== email.toLowerCase()) throw new AppError("This invitation was sent to a different email address.", "forbidden");
      await sql.exec(
        `insert into user_profiles (id, full_name, email) values ($1, $2, $3)
         on conflict (id) do update set full_name = coalesce(nullif(user_profiles.full_name, ''), excluded.full_name)`,
        [userId, fullName, email],
      );
      await sql.exec(
        `insert into school_memberships (school_id, user_id, role, status, invited_by) values ($1, $2, $3, 'active', $4)
         on conflict (school_id, user_id, role) do update set status = 'active'`,
        [inv.school_id, userId, inv.role, inv.invited_by],
      );
      if (inv.staff_id) await sql.exec("update staff set user_id = $1 where id = $2 and school_id = $3", [userId, inv.staff_id, inv.school_id]);
      if (inv.guardian_id) await sql.exec("update guardians set user_id = $1 where id = $2 and school_id = $3", [userId, inv.guardian_id, inv.school_id]);
      if (inv.student_id) await sql.exec("update students set user_id = $1 where id = $2 and school_id = $3", [userId, inv.student_id, inv.school_id]);
      // The first administrator accepting an onboarding invite activates the school.
      if (inv.role === "school_admin") {
        await sql.exec("update schools set status = 'active' where id = $1 and status = 'onboarding'", [inv.school_id]);
      }
      return inv;
    },
    { actorUserId: userId },
  );
}

/** New account: creates the auth user, then the membership. */
export async function acceptInvitation(input: { token: string; fullName: string; password: string }) {
  const preview = await previewInvitation(input.token);
  if (!preview?.usable) throw new AppError("This invitation is no longer valid. Ask your school to send a new one.");
  const created = await getAuthProvider().createUser({ email: preview.email, password: input.password, fullName: input.fullName });
  if (!created.ok) throw new AppError(created.error);
  await completeAcceptance(input.token, created.userId, input.fullName, preview.email);
  return { email: preview.email };
}

/** Existing account (e.g. a teacher who is also a parent) accepting while signed in. */
export async function acceptInvitationAsUser(token: string, user: { id: string; email: string; fullName: string }) {
  await completeAcceptance(token, user.id, user.fullName, user.email);
}
