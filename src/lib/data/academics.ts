import "server-only";
import { z } from "zod";
import type { Sql } from "../db/types";
import { AppError } from "../errors";
import { academicYearInput, calendarEventInput, classInput, sectionInput, staffInput, subjectInput, teacherAssignmentInput, timetableEntryInput } from "../schemas/academics";

// ---------------------------------------------------------------- staff
export type StaffRow = {
  id: string;
  employee_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  designation: string;
  staff_type: string;
  date_of_joining: string | null;
  status: string;
  user_id: string | null;
  roles: string[] | null;
  class_teacher_of: string | null;
  subjects_taught: number;
};

export async function listStaff(sql: Sql, schoolId: string): Promise<StaffRow[]> {
  return sql.many<StaffRow>(
    `select st.id, st.employee_code, st.full_name, st.email, st.phone, st.designation, st.staff_type, st.date_of_joining, st.status, st.user_id,
            (select array_agg(m.role::text order by m.role) from school_memberships m where m.user_id = st.user_id and m.school_id = st.school_id and m.status = 'active') as roles,
            (select string_agg(c.name || ' ' || sec.name, ', ') from sections sec join classes c on c.id = sec.class_id
               join academic_years y on y.id = sec.academic_year_id and y.is_current where sec.class_teacher_id = st.id) as class_teacher_of,
            (select count(*)::int from teacher_assignments ta where ta.staff_id = st.id) as subjects_taught
     from staff st where st.school_id = $1
     order by st.status = 'left', st.full_name`,
    [schoolId],
  );
}

export async function saveStaff(sql: Sql, schoolId: string, input: z.output<typeof staffInput>) {
  if (input.id) {
    const rows = await sql.many(
      `update staff set employee_code = $3, full_name = $4, email = $5, phone = $6, designation = $7, staff_type = $8, date_of_joining = $9, status = $10
       where id = $1 and school_id = $2 returning id`,
      [input.id, schoolId, input.employeeCode, input.fullName, input.email, input.phone, input.designation, input.staffType, input.dateOfJoining, input.status],
    );
    if (!rows.length) throw new AppError("Staff member not found", "not_found");
    // Someone who has left loses app access immediately.
    if (input.status === "left") {
      await sql.exec(
        `update school_memberships set status = 'suspended' where school_id = $1 and user_id = (select user_id from staff where id = $2)
         and role in ('school_admin', 'accountant', 'teacher', 'transport_coordinator', 'driver')`,
        [schoolId, input.id],
      );
    }
    return input.id;
  }
  const row = await sql.one<{ id: string }>(
    `insert into staff (school_id, employee_code, full_name, email, phone, designation, staff_type, date_of_joining, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [schoolId, input.employeeCode, input.fullName, input.email, input.phone, input.designation, input.staffType, input.dateOfJoining, input.status],
  );
  return row.id;
}

// ---------------------------------------------------------------- years
export async function listYears(sql: Sql, schoolId: string) {
  return sql.many<{ id: string; name: string; start_date: string; end_date: string; is_current: boolean; terms: { name: string; start_date: string; end_date: string }[] }>(
    `select y.id, y.name, y.start_date, y.end_date, y.is_current,
            coalesce((select json_agg(json_build_object('name', t.name, 'start_date', t.start_date, 'end_date', t.end_date) order by t.sort_order)
                      from terms t where t.academic_year_id = y.id), '[]'::json) as terms
     from academic_years y where y.school_id = $1 order by y.start_date desc`,
    [schoolId],
  );
}

export async function createYear(sql: Sql, schoolId: string, input: z.output<typeof academicYearInput>) {
  const y = await sql.one<{ id: string }>(
    "insert into academic_years (school_id, name, start_date, end_date) values ($1, $2, $3, $4) returning id",
    [schoolId, input.name, input.startDate, input.endDate],
  );
  // Split the year into equal terms (editable later).
  const start = new Date(`${input.startDate}T00:00:00Z`).getTime();
  const end = new Date(`${input.endDate}T00:00:00Z`).getTime();
  const step = (end - start) / input.termCount;
  for (let i = 0; i < input.termCount; i++) {
    const s = new Date(start + step * i).toISOString().slice(0, 10);
    const e = i === input.termCount - 1 ? input.endDate : new Date(start + step * (i + 1) - 86_400_000).toISOString().slice(0, 10);
    await sql.exec(
      "insert into terms (school_id, academic_year_id, name, start_date, end_date, sort_order) values ($1, $2, $3, $4, $5, $6)",
      [schoolId, y.id, `Term ${i + 1}`, s, e, i + 1],
    );
  }
  if (input.makeCurrent) await setCurrentYear(sql, schoolId, y.id);
  return y.id;
}

export async function setCurrentYear(sql: Sql, schoolId: string, yearId: string) {
  await sql.one("select id from academic_years where id = $1 and school_id = $2", [yearId, schoolId]);
  await sql.exec("update academic_years set is_current = false where school_id = $1 and is_current", [schoolId]);
  await sql.exec("update academic_years set is_current = true where id = $1", [yearId]);
}

// ---------------------------------------------------------------- classes, sections, subjects
export async function listClasses(sql: Sql, schoolId: string) {
  return sql.many<{ id: string; name: string; grade_level: number }>(
    "select id, name, grade_level from classes where school_id = $1 order by grade_level",
    [schoolId],
  );
}

export async function createClass(sql: Sql, schoolId: string, input: z.output<typeof classInput>) {
  return (await sql.one<{ id: string }>("insert into classes (school_id, name, grade_level) values ($1, $2, $3) returning id", [schoolId, input.name, input.gradeLevel])).id;
}

export async function createSection(sql: Sql, schoolId: string, yearId: string, input: z.output<typeof sectionInput>) {
  return (
    await sql.one<{ id: string }>(
      `insert into sections (school_id, class_id, academic_year_id, name, class_teacher_id, room, capacity)
       values ($1, $2, $3, upper($4), $5, $6, $7) returning id`,
      [schoolId, input.classId, yearId, input.name, input.classTeacherId, input.room, input.capacity ?? null],
    )
  ).id;
}

export async function updateSectionTeacher(sql: Sql, schoolId: string, sectionId: string, staffId: string | null) {
  const rows = await sql.many("update sections set class_teacher_id = $3 where id = $1 and school_id = $2 returning id", [sectionId, schoolId, staffId]);
  if (!rows.length) throw new AppError("Section not found", "not_found");
}

export async function createSubject(sql: Sql, schoolId: string, input: z.output<typeof subjectInput>) {
  return (await sql.one<{ id: string }>("insert into subjects (school_id, name, code) values ($1, $2, $3) returning id", [schoolId, input.name, input.code])).id;
}

export async function setSubjectActive(sql: Sql, schoolId: string, id: string, active: boolean) {
  await sql.exec("update subjects set is_active = $3 where id = $1 and school_id = $2", [id, schoolId, active]);
}

export async function listAssignments(sql: Sql, schoolId: string, yearId: string) {
  return sql.many<{ id: string; staff_id: string; staff_name: string; section_id: string; section_label: string; subject_id: string | null; subject_name: string | null }>(
    `select ta.id, ta.staff_id, st.full_name as staff_name, ta.section_id, c.name || ' ' || sec.name as section_label, ta.subject_id, s.name as subject_name
     from teacher_assignments ta join staff st on st.id = ta.staff_id
     join sections sec on sec.id = ta.section_id and sec.academic_year_id = $2
     join classes c on c.id = sec.class_id left join subjects s on s.id = ta.subject_id
     where ta.school_id = $1 order by c.grade_level, sec.name, s.name nulls first`,
    [schoolId, yearId],
  );
}

export async function createAssignment(sql: Sql, schoolId: string, input: z.output<typeof teacherAssignmentInput>) {
  await sql.exec("insert into teacher_assignments (school_id, staff_id, section_id, subject_id) values ($1, $2, $3, $4)", [
    schoolId,
    input.staffId,
    input.sectionId,
    input.subjectId,
  ]);
}

export async function deleteAssignment(sql: Sql, schoolId: string, id: string) {
  const rows = await sql.many("delete from teacher_assignments where id = $1 and school_id = $2 returning id", [id, schoolId]);
  if (!rows.length) throw new AppError("Assignment not found", "not_found");
}

// ---------------------------------------------------------------- calendar
export async function listEvents(sql: Sql, schoolId: string, from: string, to: string) {
  return sql.many<{ id: string; title: string; description: string | null; event_type: string; start_date: string; end_date: string }>(
    `select id, title, description, event_type, start_date, end_date from calendar_events
     where school_id = $1 and end_date >= $2 and start_date <= $3 order by start_date, title`,
    [schoolId, from, to],
  );
}

export async function createEvent(sql: Sql, schoolId: string, userId: string, yearId: string | null, input: z.output<typeof calendarEventInput>) {
  return (
    await sql.one<{ id: string }>(
      `insert into calendar_events (school_id, academic_year_id, title, description, event_type, start_date, end_date, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [schoolId, yearId, input.title, input.description, input.eventType, input.startDate, input.endDate, userId],
    )
  ).id;
}

export async function deleteEvent(sql: Sql, schoolId: string, id: string) {
  const rows = await sql.many("delete from calendar_events where id = $1 and school_id = $2 returning id", [id, schoolId]);
  if (!rows.length) throw new AppError("Event not found", "not_found");
}

// ---------------------------------------------------------------- timetable
export type TimetableCell = {
  id: string;
  day_of_week: number;
  period_no: number;
  start_time: string;
  end_time: string;
  subject_id: string | null;
  subject_name: string | null;
  staff_id: string | null;
  staff_name: string | null;
  section_id: string;
  section_label: string;
  room: string | null;
};

export async function timetableForSection(sql: Sql, sectionId: string): Promise<TimetableCell[]> {
  return sql.many<TimetableCell>(
    `select t.id, t.day_of_week, t.period_no, t.start_time, t.end_time, t.subject_id, s.name as subject_name, t.staff_id, st.full_name as staff_name,
            t.section_id, c.name || ' ' || sec.name as section_label, t.room
     from timetable_entries t join sections sec on sec.id = t.section_id join classes c on c.id = sec.class_id
     left join subjects s on s.id = t.subject_id left join staff st on st.id = t.staff_id
     where t.section_id = $1 order by t.day_of_week, t.period_no`,
    [sectionId],
  );
}

export async function timetableForStaff(sql: Sql, staffId: string): Promise<TimetableCell[]> {
  return sql.many<TimetableCell>(
    `select t.id, t.day_of_week, t.period_no, t.start_time, t.end_time, t.subject_id, s.name as subject_name, t.staff_id, st.full_name as staff_name,
            t.section_id, c.name || ' ' || sec.name as section_label, t.room
     from timetable_entries t join sections sec on sec.id = t.section_id join classes c on c.id = sec.class_id
     join academic_years y on y.id = sec.academic_year_id and y.is_current
     left join subjects s on s.id = t.subject_id left join staff st on st.id = t.staff_id
     where t.staff_id = $1 order by t.day_of_week, t.period_no`,
    [staffId],
  );
}

export async function saveTimetableEntry(sql: Sql, schoolId: string, input: z.output<typeof timetableEntryInput>) {
  await sql.exec(
    `insert into timetable_entries (school_id, section_id, day_of_week, period_no, start_time, end_time, subject_id, staff_id, room)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (section_id, day_of_week, period_no) do update set
       start_time = excluded.start_time, end_time = excluded.end_time, subject_id = excluded.subject_id, staff_id = excluded.staff_id, room = excluded.room`,
    [schoolId, input.sectionId, input.dayOfWeek, input.periodNo, input.startTime, input.endTime, input.subjectId, input.staffId, input.room],
  );
}

export async function deleteTimetableEntry(sql: Sql, schoolId: string, id: string) {
  await sql.exec("delete from timetable_entries where id = $1 and school_id = $2", [id, schoolId]);
}
