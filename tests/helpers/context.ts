import type { SchoolContext } from "../../src/lib/auth/context";
import type { Role } from "../../src/lib/auth/permissions";
import type { TestDb } from "./fixture";

/** Builds the same SchoolContext the app uses, bound to a seeded demo user with RLS enforced. */
export async function contextFor(t: TestDb, email: string, role: Role): Promise<SchoolContext> {
  const userId = await t.userId(email);
  const m = await t.service((sql) =>
    sql.one<{ id: string; school_id: string; name: string; slug: string; is_demo: boolean }>(
      `select m.id, m.school_id, s.name, s.slug, s.is_demo from school_memberships m join schools s on s.id = m.school_id where m.user_id = $1 and m.role = $2`,
      [userId, role],
    ),
  );
  const active = { id: m.id, schoolId: m.school_id, schoolName: m.name, schoolSlug: m.slug, schoolStatus: "active" as const, isDemo: m.is_demo, role, branding: {}, timezone: "Asia/Kolkata" };
  return {
    user: { id: userId, email, fullName: email },
    isPlatformAdmin: false,
    memberships: [active],
    active,
    schoolId: m.school_id,
    role,
    userId,
    db: (fn) => t.as(email, fn),
  };
}
