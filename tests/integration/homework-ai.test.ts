import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { answerQuestion, classTrends, draftCircular, studentWeeklySummary } from "@/lib/ai/features";
import { gradeSubmission, submitWork } from "@/lib/data/homework";
import { validateStudentImport } from "@/lib/data/students";
import { EMAILS, openTestDb, type TestDb } from "../helpers/fixture";
import { contextFor } from "../helpers/context";

let t: TestDb;
let svm: string;

beforeAll(async () => {
  t = await openTestDb();
  svm = (await t.service((sql) => sql.one<{ id: string }>("select id from schools where slug = 'sri-vidya-mandir'"))).id;
});
afterAll(() => t.close());

describe("assignment submissions", () => {
  async function upcomingAssignment() {
    const me = await t.as(EMAILS.svm.student, (sql) => sql.one<{ id: string; section_id: string }>("select s.id, e.section_id from students s join enrollments e on e.student_id = s.id and e.status = 'active'"));
    const a = await t.as(EMAILS.svm.student, (sql) =>
      sql.one<{ id: string }>("select id from assignments where section_id = $1 and due_at > now() and max_marks is not null order by due_at limit 1", [me.section_id]),
    );
    return { studentId: me.id, assignmentId: a.id };
  }

  it("a student submits, the trigger stamps time and lateness, and grading fields are ignored", async () => {
    const { studentId, assignmentId } = await upcomingAssignment();
    const id = await t.as(EMAILS.svm.student, (sql) => submitWork(sql, svm, studentId, assignmentId, "My answer"));
    // Try to sneak in marks as the student: the guard trigger resets them.
    await t.as(EMAILS.svm.student, (sql) => sql.exec("update assignment_submissions set marks_awarded = 10, feedback = 'self-graded' where id = $1", [id]));
    const row = await t.service((sql) => sql.one<{ status: string; is_late: boolean; marks_awarded: number | null; feedback: string | null }>("select status, is_late, marks_awarded, feedback from assignment_submissions where id = $1", [id]));
    expect(row).toMatchObject({ status: "submitted", is_late: false, marks_awarded: null, feedback: null });
  });

  it("a student cannot submit for a classmate", async () => {
    const { assignmentId } = await upcomingAssignment();
    const classmate = await t.service((sql) =>
      sql.one<{ student_id: string }>(
        `select e.student_id from enrollments e join assignments a on a.section_id = e.section_id
         where a.id = $1 and e.student_id not in (select id from students where user_id is not null) limit 1`,
        [assignmentId],
      ),
    );
    await expect(t.as(EMAILS.svm.student, (sql) => sql.exec("insert into assignment_submissions (school_id, assignment_id, student_id, content) values ($1, $2, $3, 'x')", [svm, assignmentId, classmate.student_id]))).rejects.toMatchObject({ code: "42501" });
  });

  it("the teacher grades within the maximum, cannot edit the answer, and the student cannot resubmit after grading", async () => {
    const { studentId, assignmentId } = await upcomingAssignment();
    const subId = await t.as(EMAILS.svm.student, (sql) => submitWork(sql, svm, studentId, assignmentId, "Final answer"));
    const sub = { id: subId };
    const subjectTeacherEmail = await t.service((sql) =>
      sql.one<{ email: string }>(
        `select u.email from assignments a join teacher_assignments ta on ta.section_id = a.section_id and ta.subject_id = a.subject_id
         join staff st on st.id = ta.staff_id join auth.users u on u.id = st.user_id where a.id = $1 limit 1`,
        [assignmentId],
      ),
    );
    await expect(t.as(subjectTeacherEmail.email, (sql) => gradeSubmission(sql, "00000000-0000-0000-0000-000000000000", { submissionId: sub.id, marks: 999, feedback: null }))).rejects.toThrow(/exceed/);
    await expect(t.as(subjectTeacherEmail.email, (sql) => sql.exec("update assignment_submissions set content = 'edited' where id = $1", [sub.id]))).rejects.toThrow(/cannot change/);
    const graderId = await t.userId(subjectTeacherEmail.email);
    await t.as(subjectTeacherEmail.email, (sql) => gradeSubmission(sql, graderId, { submissionId: sub.id, marks: 8, feedback: "Good" }));
    await expect(t.as(EMAILS.svm.student, (sql) => submitWork(sql, svm, studentId, assignmentId, "changed"))).rejects.toThrow(/already been graded/);
  });
});

describe("AI assistant (no provider configured)", () => {
  it("falls back to a template and records the generation as a draft", async () => {
    const ctx = await contextFor(t, EMAILS.svm.admin, "school_admin");
    const r = await draftCircular(ctx, { purpose: "Sports Day", details: "15 November, 8 am, main ground", audience: "parents", tone: "formal" });
    expect(r.source).toBe("template");
    expect(r.text).toContain("15 November, 8 am, main ground");
    const g = await t.service((sql) => sql.one<{ status: string; provider: string }>("select status, provider from ai_generations where id = $1", [r.generationId]));
    expect(g).toEqual({ status: "draft", provider: "template" });
  });

  it("refuses class insights for a section the teacher does not teach", async () => {
    const ctx = await contextFor(t, EMAILS.svm.teacher1, "teacher");
    const foreign = await t.service((sql) => sql.one<{ id: string }>("select id from sections where school_id <> $1 limit 1", [svm]));
    await expect(classTrends(ctx, foreign.id)).rejects.toThrow();
  });

  it("builds class insights from aggregates for a section the teacher teaches", async () => {
    const ctx = await contextFor(t, EMAILS.svm.teacher1, "teacher");
    const section = await t.as(EMAILS.svm.teacher1, (sql) => sql.one<{ id: string }>("select sec.id from sections sec join staff st on st.id = sec.class_teacher_id where st.user_id = $1", [ctx.userId]));
    const r = await classTrends(ctx, section.id);
    expect(r.text).toMatch(/Attendance: average/);
  });

  it("student summaries are limited to students the teacher teaches", async () => {
    const ctx = await contextFor(t, EMAILS.svm.teacher1, "teacher");
    const mine = await t.as(EMAILS.svm.teacher1, (sql) => sql.one<{ id: string; first_name: string }>("select id, first_name from students limit 1"));
    const r = await studentWeeklySummary(ctx, mine.id);
    expect(r.text).toContain(mine.first_name);
    const other = await t.service((sql) => sql.one<{ id: string }>("select id from students where school_id <> $1 limit 1", [svm]));
    await expect(studentWeeklySummary(ctx, other.id)).rejects.toThrow();
    const parentCtx = await contextFor(t, EMAILS.svm.parent, "parent");
    await expect(studentWeeklySummary(parentCtx, mine.id)).rejects.toThrow();
  });

  it("answers questions from records the user may see, and refuses fee questions for teachers", async () => {
    const admin = await contextFor(t, EMAILS.svm.admin, "school_admin");
    const a = await answerQuestion(admin, "Who is absent today?");
    expect(a.intent).toBe("absent_today");
    const teacher = await contextFor(t, EMAILS.svm.teacher1, "teacher");
    await expect(answerQuestion(teacher, "who has overdue fees")).rejects.toThrow(/office and accounts/);
  });
});

describe("CSV import validation", () => {
  it("flags bad rows, in-file duplicates and existing admission numbers", async () => {
    const year = await t.service((sql) => sql.one<{ id: string }>("select id from academic_years where school_id = $1 and is_current", [svm]));
    const existing = await t.service((sql) => sql.one<{ admission_no: string }>("select admission_no from students where school_id = $1 limit 1", [svm]));
    const row = (o: Record<string, string>) => ({ admission_no: "N1", first_name: "Meera", last_name: "K", date_of_birth: "14/03/2014", gender: "f", class: "Class 6", section: "A", guardian_name: "Krishnan R", guardian_phone: "98765 43210", ...o });
    const { results, valid } = await t.as(EMAILS.svm.admin, (sql) =>
      validateStudentImport(sql, svm, year.id, [
        row({}),
        row({ admission_no: "N1" }),
        row({ admission_no: existing.admission_no }),
        row({ admission_no: "N4", date_of_birth: "31/02/2014" }),
        row({ admission_no: "N5", section: "Z" }),
        row({ admission_no: "N6", guardian_phone: "12345" }),
      ]),
    );
    expect(results.map((r) => r.status)).toEqual(["ok", "duplicate", "duplicate", "error", "error", "error"]);
    expect(valid).toHaveLength(1);
    expect(valid[0].data.guardian_phone).toBe("+919876543210");
    expect(valid[0].data.date_of_birth).toBe("2014-03-14");
  });
});
