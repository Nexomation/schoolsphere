import "server-only";
import type { SchoolContext } from "@/lib/auth/context";
import { currentYear, sectionsOfYear, subjectsOf, teachingSections } from "@/lib/data/school";

/** Sections (and subjects within them) the current user may set homework for. */
export async function homeworkSections(ctx: SchoolContext) {
  return ctx.db(async (sql) => {
    const year = await currentYear(sql, ctx.schoolId);
    if (ctx.role === "teacher") {
      return (await teachingSections(sql, ctx.schoolId, ctx.userId, year.id)).map((s) => ({ id: s.id, label: s.label, subjects: s.subjects }));
    }
    const subjects = (await subjectsOf(sql, ctx.schoolId)).filter((s) => s.is_active);
    return (await sectionsOfYear(sql, ctx.schoolId, year.id)).map((s) => ({ id: s.id, label: s.label, subjects }));
  });
}

