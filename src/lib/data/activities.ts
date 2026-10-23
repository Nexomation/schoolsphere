import "server-only";
import { z } from "zod";
import type { Sql } from "../db/types";
import { AppError } from "../errors";
import { achievementInput, activityAttendanceInput, activityInput } from "../schemas/activities";

export type ActivityRow = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  coordinator_staff_id: string | null;
  coordinator: string | null;
  schedule: string | null;
  venue: string | null;
  start_date: string | null;
  end_date: string | null;
  capacity: number | null;
  registration_open: boolean;
  status: string;
  enrolled: number;
  i_coordinate: boolean;
};

export async function listActivities(sql: Sql, schoolId: string, yearId: string, userId: string): Promise<ActivityRow[]> {
  return sql.many<ActivityRow>(
    `select a.id, a.name, a.category, a.description, a.coordinator_staff_id, st.full_name as coordinator, a.schedule, a.venue, a.start_date, a.end_date,
            a.capacity, a.registration_open, a.status,
            (select count(*)::int from activity_enrollments e where e.activity_id = a.id and e.status = 'registered') as enrolled,
            coalesce(st.user_id = $3, false) as i_coordinate
     from extracurricular_activities a left join staff st on st.id = a.coordinator_staff_id
     where a.school_id = $1 and a.academic_year_id = $2 order by a.status, a.category, a.name`,
    [schoolId, yearId, userId],
  );
}

export async function saveActivity(sql: Sql, schoolId: string, yearId: string, input: z.output<typeof activityInput>) {
  const params = [input.name, input.category, input.description, input.coordinatorStaffId, input.schedule, input.venue, input.startDate, input.endDate, input.capacity, input.registrationOpen, input.status];
  if (input.id) {
    const rows = await sql.many(
      `update extracurricular_activities set name = $3, category = $4, description = $5, coordinator_staff_id = $6, schedule = $7, venue = $8,
              start_date = $9, end_date = $10, capacity = $11, registration_open = $12, status = $13
       where id = $1 and school_id = $2 returning id`,
      [input.id, schoolId, ...params],
    );
    if (!rows.length) throw new AppError("Activity not found or you are not its coordinator", "not_found");
    return input.id;
  }
  return (
    await sql.one<{ id: string }>(
      `insert into extracurricular_activities (school_id, academic_year_id, name, category, description, coordinator_staff_id, schedule, venue, start_date, end_date, capacity, registration_open, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
      [schoolId, yearId, ...params],
    )
  ).id;
}

export async function activityMembers(sql: Sql, activityId: string) {
  return sql.many<{ enrollment_id: string; student_id: string; name: string; section_label: string | null; status: string; sessions: number; present: number }>(
    `select e.id as enrollment_id, s.id as student_id, trim(s.first_name || ' ' || s.last_name) as name, c.name || ' ' || sec.name as section_label, e.status,
            (select count(*)::int from activity_attendance aa where aa.activity_id = e.activity_id and aa.student_id = s.id) as sessions,
            (select count(*)::int from activity_attendance aa where aa.activity_id = e.activity_id and aa.student_id = s.id and aa.status = 'present') as present
     from activity_enrollments e join students s on s.id = e.student_id
     left join enrollments en on en.student_id = s.id and en.status = 'active' left join sections sec on sec.id = en.section_id left join classes c on c.id = sec.class_id
     where e.activity_id = $1 order by e.status, s.first_name`,
    [activityId],
  );
}

export async function enrollStudent(sql: Sql, schoolId: string, userId: string, activityId: string, studentId: string) {
  const a = await sql.one<{ capacity: number | null; enrolled: number; status: string }>(
    `select capacity, status, (select count(*)::int from activity_enrollments e where e.activity_id = a.id and e.status = 'registered') as enrolled
     from extracurricular_activities a where a.id = $1`,
    [activityId],
  );
  if (a.status !== "active") throw new AppError("This activity is not open.");
  if (a.capacity !== null && a.enrolled >= a.capacity) throw new AppError("This activity is full.");
  await sql.exec(
    `insert into activity_enrollments (school_id, activity_id, student_id, registered_by) values ($1, $2, $3, $4)
     on conflict (activity_id, student_id) do update set status = 'registered', registered_by = excluded.registered_by`,
    [schoolId, activityId, studentId, userId],
  );
}

export async function withdrawStudent(sql: Sql, activityId: string, studentId: string) {
  const rows = await sql.many("update activity_enrollments set status = 'withdrawn' where activity_id = $1 and student_id = $2 returning id", [activityId, studentId]);
  if (!rows.length) throw new AppError("Registration not found", "not_found");
}

export async function saveActivityAttendance(sql: Sql, schoolId: string, userId: string, input: z.output<typeof activityAttendanceInput>) {
  for (const e of input.entries) {
    await sql.exec(
      `insert into activity_attendance (school_id, activity_id, student_id, session_date, status, marked_by) values ($1, $2, $3, $4, $5, $6)
       on conflict (activity_id, student_id, session_date) do update set status = excluded.status, marked_by = excluded.marked_by`,
      [schoolId, input.activityId, e.studentId, input.sessionDate, e.present ? "present" : "absent", userId],
    );
  }
}

export type AchievementRow = {
  id: string;
  student_id: string;
  student_name: string;
  section_label: string | null;
  activity_id: string | null;
  activity_name: string | null;
  category: string;
  title: string;
  description: string | null;
  level: string;
  position: string | null;
  achieved_on: string;
  status: string;
  review_note: string | null;
  submitted_by_name: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
};

export async function listAchievements(sql: Sql, schoolId: string, opts: { studentId?: string; status?: string } = {}): Promise<AchievementRow[]> {
  return sql.many<AchievementRow>(
    `select a.id, a.student_id, trim(s.first_name || ' ' || s.last_name) as student_name, c.name || ' ' || sec.name as section_label,
            a.activity_id, act.name as activity_name, a.category, a.title, a.description, a.level, a.position, a.achieved_on, a.status, a.review_note,
            sp.full_name as submitted_by_name, vp.full_name as verified_by_name, a.verified_at
     from student_achievements a join students s on s.id = a.student_id
     left join enrollments en on en.student_id = s.id and en.status = 'active' left join sections sec on sec.id = en.section_id left join classes c on c.id = sec.class_id
     left join extracurricular_activities act on act.id = a.activity_id
     left join user_profiles sp on sp.id = a.submitted_by left join user_profiles vp on vp.id = a.verified_by
     where a.school_id = $1 and ($2::uuid is null or a.student_id = $2) and ($3::text is null or a.status = $3)
     order by a.achieved_on desc`,
    [schoolId, opts.studentId ?? null, opts.status ?? null],
  );
}

/** Staff entries are verified immediately; family submissions wait for review. */
export async function addAchievement(sql: Sql, schoolId: string, userId: string, staff: boolean, input: z.output<typeof achievementInput>) {
  return (
    await sql.one<{ id: string }>(
      `insert into student_achievements (school_id, student_id, activity_id, category, title, description, level, position, achieved_on, status, submitted_by, verified_by, verified_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
      [
        schoolId, input.studentId, input.activityId, input.category, input.title, input.description, input.level, input.position, input.achievedOn,
        staff ? "verified" : "pending", userId, staff ? userId : null, staff ? new Date().toISOString() : null,
      ],
    )
  ).id;
}

export async function reviewAchievement(sql: Sql, userId: string, id: string, decision: "verified" | "rejected", note: string | null) {
  const rows = await sql.many<{ student_id: string; title: string }>(
    "update student_achievements set status = $2, verified_by = $3, verified_at = now(), review_note = $4 where id = $1 and status = 'pending' returning student_id, title",
    [id, decision, userId, note],
  );
  if (!rows.length) throw new AppError("This achievement has already been reviewed or you cannot review it.", "conflict");
  return rows[0];
}

/** Everything for the student development report. RLS limits who can load it. */
export async function studentPortfolio(sql: Sql, schoolId: string, studentId: string) {
  const activities = await sql.many<{ name: string; category: string; coordinator: string | null; status: string; sessions: number; present: number }>(
    `select a.name, a.category, st.full_name as coordinator, e.status,
            (select count(*)::int from activity_attendance aa where aa.activity_id = a.id and aa.student_id = $1) as sessions,
            (select count(*)::int from activity_attendance aa where aa.activity_id = a.id and aa.student_id = $1 and aa.status = 'present') as present
     from activity_enrollments e join extracurricular_activities a on a.id = e.activity_id left join staff st on st.id = a.coordinator_staff_id
     where e.student_id = $1 order by a.category, a.name`,
    [studentId],
  );
  const achievements = await listAchievements(sql, schoolId, { studentId });
  return { activities, achievements };
}
