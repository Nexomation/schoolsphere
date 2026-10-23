import "server-only";
import { summarizeAttendance, type AttendanceStatus } from "../domain/attendance";
import { addDays, isoWeekday, monthRange } from "../domain/dates";
import { pgArray } from "../db";
import type { Sql } from "../db/types";
import { AppError, ForbiddenError } from "../errors";
import { attendancePolicy, holidays, schoolProfile } from "./school";

export type RosterRow = {
  student_id: string;
  full_name: string;
  admission_no: string;
  roll_no: number | null;
  status: AttendanceStatus | null;
  remarks: string | null;
  record_id: string | null;
  updated_at: string | null;
};

/** Active students in a section with any attendance already recorded for the date/subject. */
export async function sectionRoster(sql: Sql, sectionId: string, date: string, subjectId: string | null): Promise<RosterRow[]> {
  return sql.many<RosterRow>(
    `select s.id as student_id, trim(s.first_name || ' ' || s.last_name) as full_name, s.admission_no, e.roll_no,
            a.status, a.remarks, a.id as record_id, a.updated_at
     from enrollments e
     join students s on s.id = e.student_id and s.status = 'active'
     left join attendance_records a on a.student_id = s.id and a.attendance_date = $2
          and a.subject_id is not distinct from $3::uuid
     where e.section_id = $1 and e.status = 'active'
     order by e.roll_no nulls last, s.first_name`,
    [sectionId, date, subjectId],
  );
}

export type DayStatus = { isWorkingDay: boolean; holiday: string | null };

export async function dayStatus(sql: Sql, schoolId: string, date: string): Promise<DayStatus> {
  const policy = await attendancePolicy(sql, schoolId);
  const holiday = await sql.maybeOne<{ title: string }>(
    "select title from calendar_events where school_id = $1 and event_type = 'holiday' and $2 between start_date and end_date limit 1",
    [schoolId, date],
  );
  return { isWorkingDay: policy.workingWeekdays.includes(isoWeekday(date)) && !holiday, holiday: holiday?.title ?? null };
}

export type MarkInput = {
  sectionId: string;
  subjectId: string | null;
  date: string;
  entries: { studentId: string; status: AttendanceStatus; remarks: string | null }[];
  correctionReason?: string;
};

/**
 * Saves a register. New rows are inserted, changed rows updated; unchanged
 * rows are left alone so the audit trail only records real corrections.
 * Teachers may edit within the school's edit window; older changes need an
 * administrator and a reason. RLS independently restricts which sections the
 * user can write to.
 */
export async function saveAttendance(
  sql: Sql,
  ctx: { schoolId: string; userId: string; role: string },
  input: MarkInput,
  today: string,
): Promise<{ inserted: number; updated: number; absentStudentIds: string[] }> {
  if (input.date > today) throw new AppError("Attendance cannot be recorded for a future date.");
  const profile = await schoolProfile(sql, ctx.schoolId);
  const window = Number((profile.settings as { attendanceEditWindowDays?: number }).attendanceEditWindowDays ?? 7);
  const isOld = input.date < addDays(today, -window);
  if (isOld && ctx.role !== "school_admin") {
    throw new ForbiddenError(`Attendance older than ${window} days can only be corrected by a school administrator.`);
  }
  if (ctx.role === "teacher") {
    // Daily (homeroom) attendance belongs to the class teacher; subject teachers record their own periods.
    const allowed = await sql.maybeOne(
      input.subjectId
        ? `select 1 from sections sec join staff st on st.school_id = sec.school_id and st.user_id = $2
           where sec.id = $1 and (sec.class_teacher_id = st.id or exists (
             select 1 from teacher_assignments ta where ta.section_id = sec.id and ta.staff_id = st.id and (ta.subject_id is null or ta.subject_id = $3)))`
        : `select 1 from sections sec join staff st on st.school_id = sec.school_id and st.user_id = $2
           where sec.id = $1 and (sec.class_teacher_id = st.id or exists (
             select 1 from teacher_assignments ta where ta.section_id = sec.id and ta.staff_id = st.id and ta.subject_id is null))`,
      input.subjectId ? [input.sectionId, ctx.userId, input.subjectId] : [input.sectionId, ctx.userId],
    );
    if (!allowed) {
      throw new ForbiddenError(input.subjectId ? "You do not teach this subject in this section." : "Only the class teacher can record daily attendance for this section.");
    }
  }
  const roster = await sectionRoster(sql, input.sectionId, input.date, input.subjectId);
  if (roster.length === 0) throw new AppError("This section has no active students, or you do not have access to it.", "forbidden");
  const byStudent = new Map(roster.map((r) => [r.student_id, r]));
  const isCorrection = roster.some((r) => r.record_id);
  // Same-day edits are normal; changing a past day's register needs a reason for the audit log.
  if (isCorrection && input.date < today && !input.correctionReason?.trim()) {
    throw new AppError("Give a reason for correcting attendance from a previous day.");
  }

  let inserted = 0;
  let updated = 0;
  const absent: string[] = [];
  for (const e of input.entries) {
    const existing = byStudent.get(e.studentId);
    if (!existing) throw new AppError("A student in the register is not enrolled in this section.");
    if (e.status === "absent") absent.push(e.studentId);
    if (!existing.record_id) {
      await sql.exec(
        `insert into attendance_records (school_id, student_id, section_id, subject_id, attendance_date, status, remarks, marked_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [ctx.schoolId, e.studentId, input.sectionId, input.subjectId, input.date, e.status, e.remarks, ctx.userId],
      );
      inserted++;
    } else if (existing.status !== e.status || (existing.remarks ?? null) !== (e.remarks ?? null)) {
      await sql.exec("update attendance_records set status = $2, remarks = $3, marked_by = $4 where id = $1", [
        existing.record_id,
        e.status,
        e.remarks,
        ctx.userId,
      ]);
      updated++;
    }
  }
  // Only newly-absent students (not already notified) trigger notifications.
  const newlyAbsent = absent.filter((id) => byStudent.get(id)?.status !== "absent");
  return { inserted, updated, absentStudentIds: newlyAbsent };
}

export type SectionDaySummary = {
  section_id: string;
  label: string;
  total: number;
  marked: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
};

export async function daySummaryBySection(sql: Sql, schoolId: string, yearId: string, date: string): Promise<SectionDaySummary[]> {
  return sql.many<SectionDaySummary>(
    `select sec.id as section_id, c.name || ' ' || sec.name as label,
            (select count(*)::int from enrollments e where e.section_id = sec.id and e.status = 'active') as total,
            count(a.id)::int as marked,
            count(*) filter (where a.status = 'present')::int as present,
            count(*) filter (where a.status = 'late')::int as late,
            count(*) filter (where a.status = 'absent')::int as absent,
            count(*) filter (where a.status = 'excused')::int as excused
     from sections sec join classes c on c.id = sec.class_id
     left join attendance_records a on a.section_id = sec.id and a.attendance_date = $3 and a.subject_id is null
     where sec.school_id = $1 and sec.academic_year_id = $2
     group by sec.id, c.name, sec.name, c.grade_level
     order by c.grade_level, sec.name`,
    [schoolId, yearId, date],
  );
}

/** Per-student monthly summary for a section, using the school attendance policy. */
export async function sectionMonthSummary(sql: Sql, schoolId: string, sectionId: string, month: string, today: string) {
  const { from, to: monthEnd } = monthRange(month);
  const to = monthEnd > today ? today : monthEnd;
  const policy = await attendancePolicy(sql, schoolId);
  const hol = await holidays(sql, schoolId, from, to);
  const roster = await sectionRoster(sql, sectionId, from, null);
  const records = await sql.many<{ student_id: string; date: string; status: AttendanceStatus }>(
    `select student_id, attendance_date as date, status from attendance_records
     where section_id = $1 and subject_id is null and attendance_date between $2 and $3`,
    [sectionId, from, to],
  );
  return roster.map((r) => ({
    studentId: r.student_id,
    name: r.full_name,
    rollNo: r.roll_no,
    summary: summarizeAttendance(records.filter((x) => x.student_id === r.student_id), { from, to }, policy, hol),
  }));
}

export async function studentAttendance(sql: Sql, schoolId: string, studentId: string, from: string, to: string) {
  const policy = await attendancePolicy(sql, schoolId);
  const hol = await holidays(sql, schoolId, from, to);
  const records = await sql.many<{ date: string; status: AttendanceStatus; remarks: string | null }>(
    `select attendance_date as date, status, remarks from attendance_records
     where student_id = $1 and subject_id is null and attendance_date between $2 and $3 order by attendance_date`,
    [studentId, from, to],
  );
  return { records, holidays: hol, policy, summary: summarizeAttendance(records, { from, to }, policy, hol) };
}

/** Attendance change history for a section and date, from the audit log (admins only by RLS). */
export async function attendanceCorrections(sql: Sql, sectionId: string, date: string) {
  return sql.many<{ id: number; created_at: string; actor: string | null; student: string; old_status: string; new_status: string; reason: string | null }>(
    `select l.id, l.created_at, p.full_name as actor, trim(s.first_name || ' ' || s.last_name) as student,
            l.old_data ->> 'status' as old_status, l.new_data ->> 'status' as new_status, l.reason
     from audit_logs l
     left join user_profiles p on p.id = l.actor_user_id
     join students s on s.id = (l.new_data ->> 'student_id')::uuid
     where l.entity_type = 'attendance_records' and l.action = 'update'
       and l.new_data ->> 'section_id' = $1 and l.new_data ->> 'attendance_date' = $2
     order by l.created_at desc limit 50`,
    [sectionId, date],
  );
}

export async function studentsByIds(sql: Sql, ids: string[]) {
  if (!ids.length) return [];
  return sql.many<{ id: string; first_name: string }>("select id, first_name from students where id = any($1::uuid[])", [pgArray(ids)]);
}
