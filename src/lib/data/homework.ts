import "server-only";
import { assignmentInput, type AssignmentInput } from "../schemas/homework";
import { pgArray } from "../db";
import type { Sql } from "../db/types";
import { AppError } from "../errors";

export { assignmentInput };


/** "2026-10-24T18:00" typed in IST -> UTC ISO string. */
export function istLocalToIso(local: string): string {
  return new Date(`${local.slice(0, 16)}:00+05:30`).toISOString();
}
export function isoToIstLocal(iso: string): string {
  return new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 16);
}

export type AssignmentRow = {
  id: string;
  title: string;
  description: string;
  due_at: string;
  max_marks: number | null;
  status: string;
  allow_late_submission: boolean;
  is_ai_assisted: boolean;
  published_at: string | null;
  section_id: string;
  section_label: string;
  subject_id: string;
  subject_name: string;
  teacher_name: string | null;
  expected: number;
  submitted: number;
  graded: number;
  late: number;
};

/** Assignments visible to the caller (RLS: teachers see their sections, families their child's). */
export async function listAssignmentsForStaff(sql: Sql, schoolId: string, yearId: string): Promise<AssignmentRow[]> {
  return sql.many<AssignmentRow>(
    `select a.id, a.title, a.description, a.due_at, a.max_marks, a.status, a.allow_late_submission, a.is_ai_assisted, a.published_at,
            a.section_id, c.name || ' ' || sec.name as section_label, a.subject_id, s.name as subject_name, st.full_name as teacher_name,
            (select count(*)::int from enrollments e where e.section_id = a.section_id and e.status = 'active') as expected,
            (select count(*)::int from assignment_submissions x where x.assignment_id = a.id) as submitted,
            (select count(*)::int from assignment_submissions x where x.assignment_id = a.id and x.status = 'graded') as graded,
            (select count(*)::int from assignment_submissions x where x.assignment_id = a.id and x.is_late) as late
     from assignments a
     join sections sec on sec.id = a.section_id and sec.academic_year_id = $2
     join classes c on c.id = sec.class_id
     join subjects s on s.id = a.subject_id
     left join staff st on st.id = a.created_by_staff_id
     where a.school_id = $1
     order by a.due_at desc`,
    [schoolId, yearId],
  );
}

export type StudentAssignmentRow = {
  id: string;
  title: string;
  subject_name: string;
  due_at: string;
  effective_due_at: string;
  max_marks: number | null;
  submission_id: string | null;
  submitted_at: string | null;
  submission_status: string | null;
  is_late: boolean | null;
  marks_awarded: number | null;
  feedback: string | null;
  allow_late_submission: boolean;
};

export type HomeworkState = "pending" | "overdue" | "submitted" | "graded";

export function homeworkState(r: Pick<StudentAssignmentRow, "submission_status" | "effective_due_at">, now = new Date()): HomeworkState {
  if (r.submission_status === "graded") return "graded";
  if (r.submission_status) return "submitted";
  return new Date(r.effective_due_at) < now ? "overdue" : "pending";
}

/** A child's assignments with submission status. Caller must be able to see the student (RLS). */
export async function assignmentsForStudent(sql: Sql, studentId: string, sectionId: string): Promise<StudentAssignmentRow[]> {
  return sql.many<StudentAssignmentRow>(
    `select a.id, a.title, s.name as subject_name, a.due_at, coalesce(x.extended_due_at, a.due_at) as effective_due_at, a.max_marks,
            sub.id as submission_id, sub.submitted_at, sub.status as submission_status, sub.is_late, sub.marks_awarded, sub.feedback,
            a.allow_late_submission
     from assignments a
     join subjects s on s.id = a.subject_id
     left join assignment_extensions x on x.assignment_id = a.id and x.student_id = $1
     left join assignment_submissions sub on sub.assignment_id = a.id and sub.student_id = $1
     where a.section_id = $2 and a.status <> 'draft'
     order by a.due_at desc`,
    [studentId, sectionId],
  );
}

export async function saveAssignment(sql: Sql, schoolId: string, staffId: string | null, input: AssignmentInput): Promise<{ id: string; isNew: boolean }> {
  const dueAt = istLocalToIso(input.dueAt);
  const status = input.publish ? "published" : "draft";
  if (input.id) {
    const before = await sql.maybeOne<{ status: string }>("select status from assignments where id = $1 and school_id = $2", [input.id, schoolId]);
    if (!before) throw new AppError("Assignment not found", "not_found");
    await sql.exec(
      `update assignments set section_id = $3, subject_id = $4, title = $5, description = $6, due_at = $7, max_marks = $8,
              allow_late_submission = $9, status = $10, published_at = coalesce(published_at, case when $10 = 'published' then now() end)
       where id = $1 and school_id = $2`,
      [input.id, schoolId, input.sectionId, input.subjectId, input.title, input.description, dueAt, input.maxMarks, input.allowLate, status],
    );
    return { id: input.id, isNew: before.status === "draft" && status === "published" };
  }
  const row = await sql.one<{ id: string }>(
    `insert into assignments (school_id, section_id, subject_id, created_by_staff_id, title, description, due_at, max_marks, allow_late_submission, status, published_at, is_ai_assisted)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, case when $10 = 'published' then now() end, $11) returning id`,
    [schoolId, input.sectionId, input.subjectId, staffId, input.title, input.description, dueAt, input.maxMarks, input.allowLate, status, input.isAiAssisted],
  );
  return { id: row.id, isNew: status === "published" };
}

export async function getAssignment(sql: Sql, id: string) {
  return sql.one<AssignmentRow & { school_id: string }>(
    `select a.id, a.school_id, a.title, a.description, a.due_at, a.max_marks, a.status, a.allow_late_submission, a.is_ai_assisted, a.published_at,
            a.section_id, c.name || ' ' || sec.name as section_label, a.subject_id, s.name as subject_name, st.full_name as teacher_name,
            (select count(*)::int from enrollments e where e.section_id = a.section_id and e.status = 'active') as expected,
            (select count(*)::int from assignment_submissions x where x.assignment_id = a.id) as submitted,
            (select count(*)::int from assignment_submissions x where x.assignment_id = a.id and x.status = 'graded') as graded,
            (select count(*)::int from assignment_submissions x where x.assignment_id = a.id and x.is_late) as late
     from assignments a join sections sec on sec.id = a.section_id join classes c on c.id = sec.class_id
     join subjects s on s.id = a.subject_id left join staff st on st.id = a.created_by_staff_id
     where a.id = $1`,
    [id],
  );
}

export async function filesFor(sql: Sql, entityType: "assignment" | "submission" | "achievement", ids: string[]) {
  if (!ids.length) return [];
  return sql.many<{ id: string; entity_id: string; file_name: string; size_bytes: number; content_type: string }>(
    "select id, entity_id, file_name, size_bytes, content_type from file_objects where entity_type = $1 and entity_id = any($2::uuid[]) order by created_at",
    [entityType, pgArray(ids)],
  );
}

export type SubmissionRow = {
  student_id: string;
  full_name: string;
  roll_no: number | null;
  submission_id: string | null;
  content: string | null;
  submitted_at: string | null;
  is_late: boolean | null;
  status: string | null;
  marks_awarded: number | null;
  feedback: string | null;
  extended_due_at: string | null;
};

/** Every student in the section, with their submission if any (teacher view). */
export async function submissionsForAssignment(sql: Sql, assignmentId: string, sectionId: string): Promise<SubmissionRow[]> {
  return sql.many<SubmissionRow>(
    `select s.id as student_id, trim(s.first_name || ' ' || s.last_name) as full_name, e.roll_no,
            sub.id as submission_id, sub.content, sub.submitted_at, sub.is_late, sub.status, sub.marks_awarded, sub.feedback, x.extended_due_at
     from enrollments e join students s on s.id = e.student_id and s.status = 'active'
     left join assignment_submissions sub on sub.assignment_id = $1 and sub.student_id = s.id
     left join assignment_extensions x on x.assignment_id = $1 and x.student_id = s.id
     where e.section_id = $2 and e.status = 'active'
     order by e.roll_no nulls last, s.first_name`,
    [assignmentId, sectionId],
  );
}

export async function gradeSubmission(sql: Sql, userId: string, input: { submissionId: string; marks: number | null; feedback: string | null }) {
  const rows = await sql.many(
    `update assignment_submissions set status = 'graded', marks_awarded = $2, feedback = $3, graded_by = $4, graded_at = now()
     where id = $1 returning id`,
    [input.submissionId, input.marks, input.feedback, userId],
  );
  if (!rows.length) throw new AppError("Submission not found", "not_found");
}

export async function returnSubmission(sql: Sql, submissionId: string, feedback: string) {
  // "Returned" sends the work back for redoing; the student can resubmit.
  const rows = await sql.many(
    "update assignment_submissions set status = 'returned', feedback = $2, graded_at = null, marks_awarded = null where id = $1 returning id",
    [submissionId, feedback],
  );
  if (!rows.length) throw new AppError("Submission not found", "not_found");
}

export async function grantExtension(sql: Sql, schoolId: string, userId: string, input: { assignmentId: string; studentId: string; until: string; reason: string }) {
  await sql.exec(
    `insert into assignment_extensions (school_id, assignment_id, student_id, extended_due_at, reason, granted_by)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (assignment_id, student_id) do update set extended_due_at = excluded.extended_due_at, reason = excluded.reason, granted_by = excluded.granted_by`,
    [schoolId, input.assignmentId, input.studentId, istLocalToIso(input.until), input.reason, userId],
  );
}

/** Student submits (or resubmits before grading). Lateness is computed by the database trigger. */
export async function submitWork(sql: Sql, schoolId: string, studentId: string, assignmentId: string, content: string): Promise<string> {
  const existing = await sql.maybeOne<{ id: string; status: string }>(
    "select id, status from assignment_submissions where assignment_id = $1 and student_id = $2",
    [assignmentId, studentId],
  );
  if (existing) {
    if (existing.status === "graded") throw new AppError("This work has already been graded.");
    await sql.exec("update assignment_submissions set content = $2, status = 'submitted' where id = $1", [existing.id, content]);
    return existing.id;
  }
  const row = await sql.one<{ id: string }>(
    "insert into assignment_submissions (school_id, assignment_id, student_id, content) values ($1, $2, $3, $4) returning id",
    [schoolId, assignmentId, studentId, content],
  );
  return row.id;
}

/** Completion by section for the dashboard and homework overview. */
export async function completionBySection(sql: Sql, schoolId: string, yearId: string, sinceIso: string) {
  return sql.many<{ section_id: string; label: string; expected: number; submitted: number }>(
    `select sec.id as section_id, c.name || ' ' || sec.name as label,
            coalesce(sum((select count(*) from enrollments e where e.section_id = a.section_id and e.status = 'active')), 0)::int as expected,
            coalesce(sum((select count(*) from assignment_submissions x where x.assignment_id = a.id)), 0)::int as submitted
     from sections sec join classes c on c.id = sec.class_id
     left join assignments a on a.section_id = sec.id and a.status <> 'draft' and a.due_at >= $3 and a.due_at <= now()
     where sec.school_id = $1 and sec.academic_year_id = $2
     group by sec.id, c.name, sec.name, c.grade_level order by c.grade_level, sec.name`,
    [schoolId, yearId, sinceIso],
  );
}
