import "server-only";
import { resolvePolicy, type AttendancePolicy, type HolidayRange } from "../domain/attendance";
import { todayIn } from "../domain/dates";
import type { Sql } from "../db/types";
import { AppError } from "../errors";

export type AcademicYear = { id: string; name: string; start_date: string; end_date: string };

export async function currentYear(sql: Sql, schoolId: string): Promise<AcademicYear> {
  const y = await sql.maybeOne<AcademicYear>(
    "select id, name, start_date, end_date from academic_years where school_id = $1 and is_current",
    [schoolId],
  );
  if (!y) throw new AppError("No current academic year is set. An administrator can set one in Classes & subjects.", "not_found");
  return y;
}

export async function maybeCurrentYear(sql: Sql, schoolId: string): Promise<AcademicYear | null> {
  return sql.maybeOne<AcademicYear>("select id, name, start_date, end_date from academic_years where school_id = $1 and is_current", [schoolId]);
}

export type SchoolProfile = {
  id: string;
  name: string;
  slug: string;
  board: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  district: string | null;
  state: string;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  udise_code: string | null;
  timezone: string;
  branding: { appName?: string; primaryColor?: string; logoUrl?: string };
  settings: Record<string, unknown>;
  status: string;
  is_demo: boolean;
  onboarding_completed_at: string | null;
};

export async function schoolProfile(sql: Sql, schoolId: string): Promise<SchoolProfile> {
  return sql.one<SchoolProfile>(
    `select id, name, slug, board, address_line1, address_line2, city, district, state, pincode, phone, email, website,
            udise_code, timezone, branding, settings, status, is_demo, onboarding_completed_at
     from schools where id = $1`,
    [schoolId],
  );
}

export async function schoolToday(sql: Sql, schoolId: string): Promise<string> {
  const s = await sql.one<{ timezone: string }>("select timezone from schools where id = $1", [schoolId]);
  return todayIn(s.timezone);
}

export async function attendancePolicy(sql: Sql, schoolId: string): Promise<AttendancePolicy> {
  const s = await sql.one<{ settings: unknown }>("select settings from schools where id = $1", [schoolId]);
  return resolvePolicy(s.settings);
}

export async function holidays(sql: Sql, schoolId: string, from: string, to: string): Promise<HolidayRange[]> {
  return sql.many<{ start: string; end: string }>(
    `select start_date as start, end_date as end from calendar_events
     where school_id = $1 and event_type = 'holiday' and start_date <= $3 and end_date >= $2`,
    [schoolId, from, to],
  );
}

export type SectionRow = {
  id: string;
  name: string;
  class_id: string;
  class_name: string;
  grade_level: number;
  label: string;
  class_teacher_id: string | null;
  class_teacher_name: string | null;
  room: string | null;
  capacity: number | null;
  student_count: number;
};

/** Sections of the current year visible to the caller (RLS: all members can see sections). */
export async function sectionsOfYear(sql: Sql, schoolId: string, yearId: string): Promise<SectionRow[]> {
  return sql.many<SectionRow>(
    `select sec.id, sec.name, c.id as class_id, c.name as class_name, c.grade_level, c.name || ' ' || sec.name as label,
            sec.class_teacher_id, st.full_name as class_teacher_name, sec.room, sec.capacity,
            (select count(*)::int from enrollments e where e.section_id = sec.id and e.status = 'active') as student_count
     from sections sec
     join classes c on c.id = sec.class_id
     left join staff st on st.id = sec.class_teacher_id
     where sec.school_id = $1 and sec.academic_year_id = $2
     order by c.grade_level, sec.name`,
    [schoolId, yearId],
  );
}

export type TeachingSection = SectionRow & { subjects: { id: string; name: string; code: string }[]; isClassTeacher: boolean };

/**
 * Sections the signed-in teacher works with, and the subjects they teach in
 * each. Class teachers get every subject.
 */
export async function teachingSections(sql: Sql, schoolId: string, userId: string, yearId: string): Promise<TeachingSection[]> {
  const all = await sectionsOfYear(sql, schoolId, yearId);
  const staff = await sql.maybeOne<{ id: string }>("select id from staff where school_id = $1 and user_id = $2", [schoolId, userId]);
  if (!staff) return [];
  const assignments = await sql.many<{ section_id: string; subject_id: string | null; name: string | null; code: string | null }>(
    `select ta.section_id, ta.subject_id, s.name, s.code from teacher_assignments ta
     left join subjects s on s.id = ta.subject_id where ta.staff_id = $1`,
    [staff.id],
  );
  const allSubjects = await sql.many<{ id: string; name: string; code: string }>(
    "select id, name, code from subjects where school_id = $1 and is_active order by name",
    [schoolId],
  );
  const result: TeachingSection[] = [];
  for (const sec of all) {
    const isClassTeacher = sec.class_teacher_id === staff.id;
    const mine = assignments.filter((a) => a.section_id === sec.id);
    if (!isClassTeacher && mine.length === 0) continue;
    const wholeSection = isClassTeacher || mine.some((a) => a.subject_id === null);
    const subjects = wholeSection
      ? allSubjects
      : mine.filter((a) => a.subject_id).map((a) => ({ id: a.subject_id!, name: a.name!, code: a.code! }));
    result.push({ ...sec, subjects, isClassTeacher });
  }
  return result;
}

export type ChildSummary = {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  admission_no: string;
  section_id: string | null;
  section_label: string | null;
  roll_no: number | null;
};

/**
 * Children the signed-in parent or student may see. RLS already limits
 * `students` to verified family links; this adds enrollment details.
 */
export async function familyChildren(sql: Sql, schoolId: string): Promise<ChildSummary[]> {
  return sql.many<ChildSummary>(
    `select s.id, s.first_name, s.last_name, trim(s.first_name || ' ' || s.last_name) as full_name, s.admission_no,
            e.section_id, c.name || ' ' || sec.name as section_label, e.roll_no
     from students s
     left join enrollments e on e.student_id = s.id and e.status = 'active'
     left join sections sec on sec.id = e.section_id
     left join classes c on c.id = sec.class_id
     where s.school_id = $1 and s.status = 'active'
     order by c.grade_level nulls last, s.first_name`,
    [schoolId],
  );
}

/** Resolves ?child= for parent pages, defaulting to the first child. Never trusts the id beyond RLS. */
export function pickChild(children: ChildSummary[], requested: string | string[] | undefined): ChildSummary | null {
  const id = Array.isArray(requested) ? requested[0] : requested;
  return children.find((c) => c.id === id) ?? children[0] ?? null;
}

export async function subjectsOf(sql: Sql, schoolId: string) {
  return sql.many<{ id: string; name: string; code: string; is_active: boolean }>(
    "select id, name, code, is_active from subjects where school_id = $1 order by name",
    [schoolId],
  );
}

export async function myStaffId(sql: Sql, schoolId: string, userId: string): Promise<string | null> {
  const row = await sql.maybeOne<{ id: string }>("select id from staff where school_id = $1 and user_id = $2", [schoolId, userId]);
  return row?.id ?? null;
}
