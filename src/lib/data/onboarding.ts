import "server-only";
import { z } from "zod";
import { createToken } from "../auth/password";
import { withService, withUser } from "../db";
import type { Sql } from "../db/types";
import { DEFAULT_ATTENDANCE_POLICY } from "../domain/attendance";
import { GRADE_SCALE_PRESETS } from "../domain/grading";
import { env } from "../env";
import { AppError } from "../errors";
import { BOARDS } from "../schemas/settings";

export const onboardSchoolInput = z.object({
  name: z.string().trim().min(3).max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9-]{1,58})[a-z0-9]$/, "3–60 lowercase letters, numbers or hyphens"),
  board: z.enum(BOARDS),
  city: z.string().trim().min(2).max(80),
  district: z.string().trim().max(80).optional(),
  principalName: z.string().trim().min(2).max(120),
  principalEmail: z.email().transform((v) => v.toLowerCase()),
});

/**
 * Platform admin creates a tenant: the school row (status "onboarding"),
 * sensible defaults (grade scales, policies, fee categories) and a one-time
 * invitation for the principal. Authorization is checked by the caller.
 */
export async function onboardSchool(actorUserId: string, input: z.output<typeof onboardSchoolInput>) {
  const { token, hash } = createToken();
  const schoolId = await withService(
    async (sql) => {
      const exists = await sql.maybeOne("select 1 from schools where slug = $1", [input.slug]);
      if (exists) throw new AppError("That short name is already taken.", "conflict", { slug: "Already taken" });
      const school = await sql.one<{ id: string }>(
        `insert into schools (name, slug, board, city, district, status, branding, settings)
         values ($1, $2, $3, $4, $5, 'onboarding', '{}'::jsonb, $6::jsonb) returning id`,
        [input.name, input.slug, input.board, input.city, input.district ?? null, JSON.stringify({ attendance: DEFAULT_ATTENDANCE_POLICY, attendanceEditWindowDays: 7, absentPolicy: "absent_counts_as_zero", receiptPrefix: input.slug.replace(/[^a-z]/g, "").slice(0, 3).toUpperCase() || "SCH" })],
      );
      const defaultPreset = input.board === "CBSE" ? "cbse_9_point" : "tn_state_board";
      for (const [key, preset] of Object.entries(GRADE_SCALE_PRESETS)) {
        await sql.exec("insert into grade_scales (school_id, name, bands, is_default) values ($1, $2, $3::jsonb, $4)", [school.id, preset.name, JSON.stringify(preset.bands), key === defaultPreset]);
      }
      for (const [name, description] of [
        ["Tuition fee", "Academic tuition"],
        ["Transport fee", "School van / bus"],
        ["Activity fee", "Sports, clubs and events"],
      ]) {
        await sql.exec("insert into fee_categories (school_id, name, description) values ($1, $2, $3)", [school.id, name, description]);
      }
      await sql.exec(
        `insert into invitations (school_id, email, full_name, role, token_hash, expires_at, invited_by)
         values ($1, $2, $3, 'school_admin', $4, now() + interval '14 days', $5)`,
        [school.id, input.principalEmail, input.principalName, hash, actorUserId],
      );
      return school.id;
    },
    { actorUserId, reason: "School onboarded" },
  );
  return { schoolId, inviteLink: `${env().APP_URL}/invite/${token}` };
}

// ---------------------------------------------------------------- setup wizard (school admin)
export const STANDARD_CLASSES = [
  { name: "Pre-KG", grade: -2 },
  { name: "LKG", grade: -1 },
  { name: "UKG", grade: 0 },
  ...Array.from({ length: 12 }, (_, i) => ({ name: `Class ${i + 1}`, grade: i + 1 })),
];

export const SUBJECT_PRESETS = [
  { name: "English", code: "ENG" },
  { name: "Tamil", code: "TAM" },
  { name: "Hindi", code: "HIN" },
  { name: "Mathematics", code: "MAT" },
  { name: "Science", code: "SCI" },
  { name: "Social Science", code: "SOC" },
  { name: "Environmental Studies", code: "EVS" },
  { name: "Computer Science", code: "CS" },
  { name: "Physics", code: "PHY" },
  { name: "Chemistry", code: "CHE" },
  { name: "Biology", code: "BIO" },
  { name: "Commerce", code: "COM" },
  { name: "Accountancy", code: "ACC" },
  { name: "Economics", code: "ECO" },
  { name: "Physical Education", code: "PE" },
];

export const quickClassesInput = z.object({
  grades: z.array(z.coerce.number().int().min(-2).max(12)).min(1, "Choose at least one class"),
  sectionsPerClass: z.coerce.number().int().min(1).max(10),
});

export async function quickSetupClasses(sql: Sql, schoolId: string, yearId: string, input: z.output<typeof quickClassesInput>) {
  let sections = 0;
  for (const grade of input.grades) {
    const def = STANDARD_CLASSES.find((c) => c.grade === grade);
    if (!def) continue;
    const cls = await sql.one<{ id: string }>(
      `insert into classes (school_id, name, grade_level) values ($1, $2, $3)
       on conflict (school_id, grade_level) do update set name = classes.name returning id`,
      [schoolId, def.name, grade],
    );
    for (let i = 0; i < input.sectionsPerClass; i++) {
      const r = await sql.many(
        "insert into sections (school_id, class_id, academic_year_id, name) values ($1, $2, $3, $4) on conflict (class_id, academic_year_id, name) do nothing returning id",
        [schoolId, cls.id, yearId, String.fromCharCode(65 + i)],
      );
      sections += r.length;
    }
  }
  return sections;
}

export async function addPresetSubjects(sql: Sql, schoolId: string, codes: string[]) {
  let added = 0;
  for (const s of SUBJECT_PRESETS.filter((p) => codes.includes(p.code))) {
    const r = await sql.many("insert into subjects (school_id, name, code) values ($1, $2, $3) on conflict (school_id, code) do nothing returning id", [schoolId, s.name, s.code]);
    added += r.length;
  }
  return added;
}

export async function setupProgress(userId: string, schoolId: string) {
  return withUser({ userId }, async (sql) => {
    const s = await sql.one<{ profile: boolean; year: boolean; classes: number; sections: number; subjects: number; staff: number; students: number; done: boolean }>(
      `select (address_line1 is not null and phone is not null) as profile,
              exists (select 1 from academic_years y where y.school_id = s.id and y.is_current) as year,
              (select count(*)::int from classes c where c.school_id = s.id) as classes,
              (select count(*)::int from sections x join academic_years y on y.id = x.academic_year_id and y.is_current where x.school_id = s.id) as sections,
              (select count(*)::int from subjects x where x.school_id = s.id) as subjects,
              (select count(*)::int from staff x where x.school_id = s.id) as staff,
              (select count(*)::int from students x where x.school_id = s.id) as students,
              onboarding_completed_at is not null as done
       from schools s where s.id = $1`,
      [schoolId],
    );
    return s;
  });
}
