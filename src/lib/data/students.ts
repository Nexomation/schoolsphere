import "server-only";
import { z } from "zod";
import type { Sql } from "../db/types";
import { AppError } from "../errors";
import { BLOOD_GROUPS, GENDERS, RELATIONSHIPS, indianPhone, normaliseDate } from "../schemas/common";
import type { AdmissionInput } from "../schemas/students";
import { studentInput, linkGuardianInput } from "../schemas/students";

export type StudentListRow = {
  id: string;
  admission_no: string;
  full_name: string;
  gender: string;
  date_of_birth: string;
  status: string;
  section_id: string | null;
  section_label: string | null;
  grade_level: number | null;
  roll_no: number | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  unverified_links: number;
  uses_transport: boolean;
};

/** Students visible to the caller (RLS scopes teachers to their sections). */
export async function listStudents(sql: Sql, schoolId: string, yearId: string): Promise<StudentListRow[]> {
  return sql.many<StudentListRow>(
    `select s.id, s.admission_no, trim(s.first_name || ' ' || s.last_name) as full_name, s.gender, s.date_of_birth, s.status,
            e.section_id, c.name || ' ' || sec.name as section_label, c.grade_level, e.roll_no,
            g.full_name as guardian_name, g.phone as guardian_phone,
            (select count(*)::int from student_guardians x where x.student_id = s.id and x.verified_at is null) as unverified_links,
            exists (select 1 from student_transport_assignments t where t.student_id = s.id and t.end_date is null) as uses_transport
     from students s
     left join enrollments e on e.student_id = s.id and e.academic_year_id = $2
     left join sections sec on sec.id = e.section_id
     left join classes c on c.id = sec.class_id
     left join lateral (
       select gg.full_name, gg.phone from student_guardians sg join guardians gg on gg.id = sg.guardian_id
       where sg.student_id = s.id order by sg.is_primary desc, sg.created_at limit 1
     ) g on true
     where s.school_id = $1
     order by c.grade_level nulls last, sec.name, e.roll_no nulls last, s.first_name`,
    [schoolId, yearId],
  );
}

export type StudentDetail = {
  id: string;
  school_id: string;
  admission_no: string;
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string;
  gender: string;
  blood_group: string | null;
  address: string | null;
  emis_no: string | null;
  admission_date: string;
  status: string;
  medical_notes: string | null;
  user_id: string | null;
};

export async function getStudent(sql: Sql, id: string): Promise<StudentDetail> {
  return sql.one<StudentDetail>(
    `select id, school_id, admission_no, first_name, last_name, trim(first_name || ' ' || last_name) as full_name, date_of_birth, gender,
            blood_group, address, emis_no, admission_date, status, medical_notes, user_id
     from students where id = $1`,
    [id],
  );
}

export async function studentEnrollments(sql: Sql, studentId: string) {
  return sql.many<{ id: string; year: string; section_label: string; roll_no: number | null; status: string; enrolled_on: string; left_on: string | null; section_id: string; academic_year_id: string }>(
    `select e.id, y.name as year, c.name || ' ' || sec.name as section_label, e.roll_no, e.status, e.enrolled_on, e.left_on, e.section_id, e.academic_year_id
     from enrollments e join academic_years y on y.id = e.academic_year_id
     join sections sec on sec.id = e.section_id join classes c on c.id = sec.class_id
     where e.student_id = $1 order by y.start_date desc`,
    [studentId],
  );
}

export async function studentGuardians(sql: Sql, studentId: string) {
  return sql.many<{
    link_id: string;
    guardian_id: string;
    full_name: string;
    phone: string;
    email: string | null;
    occupation: string | null;
    relationship: string;
    is_primary: boolean;
    can_pickup: boolean;
    verified_at: string | null;
    has_account: boolean;
  }>(
    `select sg.id as link_id, g.id as guardian_id, g.full_name, g.phone, g.email, g.occupation, sg.relationship, sg.is_primary,
            sg.can_pickup, sg.verified_at, g.user_id is not null as has_account
     from student_guardians sg join guardians g on g.id = sg.guardian_id
     where sg.student_id = $1 order by sg.is_primary desc, sg.created_at`,
    [studentId],
  );
}

async function upsertGuardian(sql: Sql, schoolId: string, g: { fullName: string; phone: string; email: string | null; occupation: string | null }) {
  // A guardian is identified by phone within a school (siblings share guardians).
  const existing = await sql.maybeOne<{ id: string }>("select id from guardians where school_id = $1 and phone = $2", [schoolId, g.phone]);
  if (existing) {
    await sql.exec(
      "update guardians set email = coalesce($2, email), occupation = coalesce($3, occupation) where id = $1",
      [existing.id, g.email, g.occupation],
    );
    return existing.id;
  }
  const row = await sql.one<{ id: string }>(
    "insert into guardians (school_id, full_name, phone, email, occupation) values ($1, $2, $3, $4, $5) returning id",
    [schoolId, g.fullName, g.phone, g.email, g.occupation],
  );
  return row.id;
}

async function nextRollNo(sql: Sql, sectionId: string) {
  const r = await sql.one<{ n: number }>("select coalesce(max(roll_no), 0)::int + 1 as n from enrollments where section_id = $1", [sectionId]);
  return r.n;
}

export async function admitStudent(sql: Sql, schoolId: string, userId: string, input: AdmissionInput): Promise<string> {
  const section = await sql.maybeOne<{ academic_year_id: string }>(
    "select academic_year_id from sections where id = $1 and school_id = $2",
    [input.sectionId, schoolId],
  );
  if (!section) throw new AppError("Select a valid section", "bad_request", { sectionId: "Select a valid section" });
  const student = await sql.one<{ id: string }>(
    `insert into students (school_id, admission_no, first_name, last_name, date_of_birth, gender, blood_group, address, emis_no, admission_date, medical_notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [schoolId, input.admissionNo, input.firstName, input.lastName, input.dateOfBirth, input.gender, input.bloodGroup, input.address, input.emisNo, input.admissionDate, input.medicalNotes],
  );
  await sql.exec(
    `insert into enrollments (school_id, student_id, section_id, academic_year_id, roll_no, enrolled_on) values ($1, $2, $3, $4, $5, $6)`,
    [schoolId, student.id, input.sectionId, section.academic_year_id, input.rollNo ?? (await nextRollNo(sql, input.sectionId)), input.admissionDate],
  );
  const guardianId = await upsertGuardian(sql, schoolId, input.guardian);
  // Created by the school office from admission documents, so the link is verified.
  await sql.exec(
    `insert into student_guardians (school_id, student_id, guardian_id, relationship, is_primary, verified_at, verified_by)
     values ($1, $2, $3, $4, true, now(), $5)`,
    [schoolId, student.id, guardianId, input.guardian.relationship, userId],
  );
  return student.id;
}

export async function updateStudent(sql: Sql, schoolId: string, id: string, input: z.output<typeof studentInput>) {
  const rows = await sql.many(
    `update students set admission_no = $3, first_name = $4, last_name = $5, date_of_birth = $6, gender = $7, blood_group = $8,
            address = $9, emis_no = $10, admission_date = $11, medical_notes = $12
     where id = $1 and school_id = $2 returning id`,
    [id, schoolId, input.admissionNo, input.firstName, input.lastName, input.dateOfBirth, input.gender, input.bloodGroup, input.address, input.emisNo, input.admissionDate, input.medicalNotes],
  );
  if (rows.length === 0) throw new AppError("Student not found", "not_found");
}

export async function changeStudentStatus(
  sql: Sql,
  schoolId: string,
  input: { studentId: string; status: string; effectiveDate: string },
) {
  const rows = await sql.many(
    "update students set status = $3, status_changed_at = now() where id = $1 and school_id = $2 returning id",
    [input.studentId, schoolId, input.status],
  );
  if (rows.length === 0) throw new AppError("Student not found", "not_found");
  if (input.status !== "active") {
    const enrollmentStatus = input.status === "graduated" ? "completed" : input.status === "transferred" ? "transferred" : "withdrawn";
    await sql.exec(
      "update enrollments set status = $2, left_on = $3 where student_id = $1 and status = 'active'",
      [input.studentId, enrollmentStatus, input.effectiveDate],
    );
    await sql.exec("update student_transport_assignments set end_date = $2 where student_id = $1 and end_date is null", [input.studentId, input.effectiveDate]);
  }
}

export async function linkGuardian(sql: Sql, schoolId: string, userId: string, input: z.output<typeof linkGuardianInput>) {
  await sql.one("select id from students where id = $1 and school_id = $2", [input.studentId, schoolId]);
  const guardianId = await upsertGuardian(sql, schoolId, input);
  if (input.isPrimary) await sql.exec("update student_guardians set is_primary = false where student_id = $1", [input.studentId]);
  await sql.exec(
    `insert into student_guardians (school_id, student_id, guardian_id, relationship, is_primary, verified_at, verified_by)
     values ($1, $2, $3, $4, $5, ${input.verify ? "now()" : "null"}, ${input.verify ? "$6" : "null"})
     on conflict (student_id, guardian_id) do update set relationship = excluded.relationship, is_primary = excluded.is_primary`,
    input.verify
      ? [schoolId, input.studentId, guardianId, input.relationship, input.isPrimary, userId]
      : [schoolId, input.studentId, guardianId, input.relationship, input.isPrimary],
  );
  return guardianId;
}

export async function setLinkVerified(sql: Sql, schoolId: string, userId: string, linkId: string, verified: boolean) {
  const rows = await sql.many(
    `update student_guardians set verified_at = ${verified ? "now()" : "null"}, verified_by = ${verified ? "$3" : "null"}
     where id = $1 and school_id = $2 returning id`,
    verified ? [linkId, schoolId, userId] : [linkId, schoolId],
  );
  if (rows.length === 0) throw new AppError("Guardian link not found", "not_found");
}

export async function removeGuardianLink(sql: Sql, schoolId: string, linkId: string) {
  const rows = await sql.many("delete from student_guardians where id = $1 and school_id = $2 returning id", [linkId, schoolId]);
  if (rows.length === 0) throw new AppError("Guardian link not found", "not_found");
}

/** Moves selected students from one section to another (normally into the next academic year). */
export async function promoteStudents(sql: Sql, schoolId: string, input: { fromSectionId: string; toSectionId: string; studentIds: string[] }) {
  const to = await sql.maybeOne<{ academic_year_id: string; start_date: string }>(
    `select sec.academic_year_id, y.start_date from sections sec join academic_years y on y.id = sec.academic_year_id
     where sec.id = $1 and sec.school_id = $2`,
    [input.toSectionId, schoolId],
  );
  const from = await sql.maybeOne<{ academic_year_id: string }>("select academic_year_id from sections where id = $1 and school_id = $2", [input.fromSectionId, schoolId]);
  if (!to || !from) throw new AppError("Select valid sections");
  let moved = 0;
  for (const studentId of input.studentIds) {
    const current = await sql.maybeOne<{ id: string }>(
      "select id from enrollments where student_id = $1 and section_id = $2 and status = 'active'",
      [studentId, input.fromSectionId],
    );
    if (!current) continue;
    if (from.academic_year_id === to.academic_year_id) {
      // Section change within the same year.
      await sql.exec("update enrollments set section_id = $2, roll_no = null where id = $1", [current.id, input.toSectionId]);
    } else {
      await sql.exec("update enrollments set status = 'promoted', left_on = $2 where id = $1", [current.id, to.start_date]);
      await sql.exec(
        `insert into enrollments (school_id, student_id, section_id, academic_year_id, enrolled_on) values ($1, $2, $3, $4, $5)
         on conflict (student_id, academic_year_id) do nothing`,
        [schoolId, studentId, input.toSectionId, to.academic_year_id, to.start_date],
      );
    }
    moved++;
  }
  return moved;
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------
export const IMPORT_COLUMNS = [
  "admission_no",
  "first_name",
  "last_name",
  "date_of_birth",
  "gender",
  "class",
  "section",
  "roll_no",
  "guardian_name",
  "guardian_relationship",
  "guardian_phone",
  "guardian_email",
  "blood_group",
  "address",
  "emis_no",
] as const;

const importRow = z.object({
  admission_no: z.string().min(1, "admission_no is required").max(30).regex(/^[A-Za-z0-9/_-]+$/, "admission_no has invalid characters"),
  first_name: z.string().min(1, "first_name is required").max(80),
  last_name: z.string().max(80).default(""),
  date_of_birth: z.string().transform((v, ctx) => {
    const d = normaliseDate(v);
    if (!d) ctx.addIssue({ code: "custom", message: "date_of_birth must be DD/MM/YYYY or YYYY-MM-DD" });
    return d ?? "";
  }),
  gender: z
    .string()
    .transform((v) => ({ m: "male", f: "female", boy: "male", girl: "female" })[v.toLowerCase()] ?? v.toLowerCase())
    .pipe(z.enum(GENDERS, "gender must be male, female or other")),
  class: z.string().min(1, "class is required"),
  section: z.string().min(1, "section is required"),
  roll_no: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 500), "roll_no must be a whole number"),
  guardian_name: z.string().min(2, "guardian_name is required").max(120),
  guardian_relationship: z
    .string()
    .optional()
    .transform((v) => (v ? v.toLowerCase() : "guardian"))
    .pipe(z.enum(RELATIONSHIPS, "guardian_relationship is not recognised")),
  guardian_phone: indianPhone,
  guardian_email: z
    .string()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || z.email().safeParse(v).success, "guardian_email is not valid"),
  blood_group: z
    .string()
    .optional()
    .transform((v) => (v ? v.toUpperCase().replace(/\s/g, "") : null))
    .refine((v) => v === null || (BLOOD_GROUPS as readonly string[]).includes(v), "blood_group is not recognised"),
  address: z.string().max(500).optional().transform((v) => v || null),
  emis_no: z.string().max(30).optional().transform((v) => v || null),
});

export type ImportRowResult = {
  line: number;
  admissionNo: string;
  name: string;
  sectionLabel: string;
  status: "ok" | "error" | "duplicate";
  messages: string[];
};

export async function validateStudentImport(sql: Sql, schoolId: string, yearId: string, rows: Record<string, string>[]) {
  const sections = await sql.many<{ id: string; class_name: string; section: string }>(
    `select sec.id, lower(c.name) as class_name, lower(sec.name) as section from sections sec join classes c on c.id = sec.class_id
     where sec.school_id = $1 and sec.academic_year_id = $2`,
    [schoolId, yearId],
  );
  const existing = new Set(
    (await sql.many<{ admission_no: string }>("select lower(admission_no) as admission_no from students where school_id = $1", [schoolId])).map((r) => r.admission_no),
  );
  const seenAdmission = new Map<string, number>();
  const seenPerson = new Map<string, number>();
  const results: ImportRowResult[] = [];
  const valid: { line: number; data: z.output<typeof importRow>; sectionId: string }[] = [];

  rows.forEach((raw, i) => {
    const line = i + 2; // header is line 1
    const parsed = importRow.safeParse(raw);
    const base = { line, admissionNo: raw.admission_no ?? "", name: `${raw.first_name ?? ""} ${raw.last_name ?? ""}`.trim(), sectionLabel: `${raw.class ?? ""} ${raw.section ?? ""}`.trim() };
    if (!parsed.success) {
      results.push({ ...base, status: "error", messages: [...new Set(parsed.error.issues.map((x) => x.message))] });
      return;
    }
    const d = parsed.data;
    const messages: string[] = [];
    const cls = d.class.toLowerCase().replace(/^(\d+)$/, "class $1").replace(/^std\.?\s*/, "class ");
    const section = sections.find((s) => s.class_name === cls && s.section === d.section.toLowerCase());
    if (!section) messages.push(`No section "${d.class} ${d.section}" in the current year`);
    const key = d.admission_no.toLowerCase();
    if (existing.has(key)) {
      results.push({ ...base, status: "duplicate", messages: ["admission_no already exists in this school"] });
      return;
    }
    if (seenAdmission.has(key)) {
      results.push({ ...base, status: "duplicate", messages: [`admission_no repeats line ${seenAdmission.get(key)}`] });
      return;
    }
    seenAdmission.set(key, line);
    const personKey = `${d.first_name.toLowerCase()}|${d.last_name.toLowerCase()}|${d.date_of_birth}`;
    if (seenPerson.has(personKey)) messages.push(`Same name and date of birth as line ${seenPerson.get(personKey)} — check for a duplicate`);
    seenPerson.set(personKey, line);
    if (!section) {
      results.push({ ...base, status: "error", messages });
      return;
    }
    results.push({ ...base, status: "ok", messages });
    valid.push({ line, data: d, sectionId: section.id });
  });
  return { results, valid };
}

export async function importStudents(sql: Sql, schoolId: string, userId: string, valid: { data: z.output<typeof importRow>; sectionId: string }[]) {
  const today = new Date().toISOString().slice(0, 10);
  for (const v of valid) {
    await admitStudent(sql, schoolId, userId, {
      admissionNo: v.data.admission_no,
      firstName: v.data.first_name,
      lastName: v.data.last_name,
      dateOfBirth: v.data.date_of_birth,
      gender: v.data.gender,
      bloodGroup: v.data.blood_group as AdmissionInput["bloodGroup"],
      address: v.data.address,
      emisNo: v.data.emis_no,
      admissionDate: today,
      medicalNotes: null,
      sectionId: v.sectionId,
      rollNo: v.data.roll_no ?? undefined,
      guardian: {
        fullName: v.data.guardian_name,
        relationship: v.data.guardian_relationship,
        phone: v.data.guardian_phone,
        email: v.data.guardian_email,
        occupation: null,
      },
    });
  }
  return valid.length;
}
