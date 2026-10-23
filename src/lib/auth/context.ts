import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withService, withUser } from "../db";
import type { Sql } from "../db/types";
import { ForbiddenError, UnauthenticatedError } from "../errors";
import { getAuthProvider } from "./provider";
import { can, ROLE_PRIORITY, type Permission, type Role } from "./permissions";

export const ACTIVE_MEMBERSHIP_COOKIE = "ss_active";

export type Membership = {
  id: string;
  schoolId: string;
  schoolName: string;
  schoolSlug: string;
  schoolStatus: "onboarding" | "active" | "suspended";
  isDemo: boolean;
  role: Role;
  branding: { appName?: string; primaryColor?: string; logoUrl?: string };
  timezone: string;
};

export type AuthContext = {
  user: { id: string; email: string; fullName: string };
  isPlatformAdmin: boolean;
  memberships: Membership[];
  active: Membership | null;
};

export type SchoolContext = AuthContext & {
  active: Membership;
  schoolId: string;
  role: Role;
  userId: string;
  /** Runs SQL as this user with RLS enforced. */
  db<T>(fn: (sql: Sql) => Promise<T>, opts?: { reason?: string }): Promise<T>;
};

/**
 * Loads the signed-in user, their memberships and the active school/role.
 * Memoised per request. Membership data is read with the user's own RLS
 * scope, so it can only ever contain schools the user belongs to.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const sessionUser = await getAuthProvider().getSessionUser();
  if (!sessionUser) return null;

  const data = await withUser({ userId: sessionUser.id }, async (sql) => {
    const profile = await sql.maybeOne<{ full_name: string }>("select full_name from user_profiles where id = $1", [sessionUser.id]);
    const admin = await sql.maybeOne("select 1 from platform_admins where user_id = $1", [sessionUser.id]);
    const memberships = await sql.many<{
      id: string;
      school_id: string;
      name: string;
      slug: string;
      status: Membership["schoolStatus"];
      is_demo: boolean;
      role: Role;
      branding: Membership["branding"];
      timezone: string;
    }>(
      `select m.id, m.school_id, s.name, s.slug, s.status, s.is_demo, m.role, s.branding, s.timezone
       from school_memberships m join schools s on s.id = m.school_id
       where m.user_id = $1 and m.status = 'active' and s.status <> 'suspended'
       order by s.name`,
      [sessionUser.id],
    );
    return { profile, isPlatformAdmin: !!admin, memberships };
  });

  // First sign-in through an external provider may not have a profile yet.
  if (!data.profile) {
    await withService((sql) =>
      sql.exec("insert into user_profiles (id, full_name, email) values ($1, $2, $3) on conflict (id) do nothing", [
        sessionUser.id,
        sessionUser.email.split("@")[0],
        sessionUser.email,
      ]),
    );
  }

  const memberships: Membership[] = data.memberships
    .map((m) => ({
      id: m.id,
      schoolId: m.school_id,
      schoolName: m.name,
      schoolSlug: m.slug,
      schoolStatus: m.status,
      isDemo: m.is_demo,
      role: m.role,
      branding: m.branding ?? {},
      timezone: m.timezone,
    }))
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName) || ROLE_PRIORITY.indexOf(a.role) - ROLE_PRIORITY.indexOf(b.role));

  const preferred = (await cookies()).get(ACTIVE_MEMBERSHIP_COOKIE)?.value;
  const active =
    memberships.find((m) => m.id === preferred) ??
    [...memberships].sort((a, b) => ROLE_PRIORITY.indexOf(a.role) - ROLE_PRIORITY.indexOf(b.role))[0] ??
    null;

  return {
    user: { id: sessionUser.id, email: sessionUser.email, fullName: data.profile?.full_name ?? sessionUser.email },
    isPlatformAdmin: data.isPlatformAdmin,
    memberships,
    active,
  };
});

function toSchoolContext(ctx: AuthContext & { active: Membership }): SchoolContext {
  return {
    ...ctx,
    schoolId: ctx.active.schoolId,
    role: ctx.active.role,
    userId: ctx.user.id,
    db: (fn, opts) => withUser({ userId: ctx.user.id, reason: opts?.reason }, fn),
  };
}

/** For pages: redirects to /login or /app when requirements are not met. */
export async function requirePageContext(permission?: Permission): Promise<SchoolContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!ctx.active) redirect(ctx.isPlatformAdmin ? "/platform" : "/no-access");
  if (permission && !can(ctx.active.role, permission)) redirect("/app?denied=1");
  return toSchoolContext(ctx as AuthContext & { active: Membership });
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function requireActionContext(permission?: Permission): Promise<SchoolContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new UnauthenticatedError();
  if (!ctx.active) throw new ForbiddenError("You are not a member of any school.");
  if (permission && !can(ctx.active.role, permission)) throw new ForbiddenError();
  return toSchoolContext(ctx as AuthContext & { active: Membership });
}

export async function requirePlatformAdmin(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!ctx.isPlatformAdmin) redirect("/app");
  return ctx;
}
