import "server-only";
import { z } from "zod";
import { computeExamResult, subjectStatistics, type AbsentPolicy, type GradeBand } from "../domain/grading";
import type { Sql } from "../db/types";
import { AppError, ForbiddenError } from "../errors";
import { examInput, marksEntryInput } from "../schemas/exams";

export type ExamRow = {
  id: string;
  name: string;
  exam_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  class_id: string;
  class_name: string;
  term_name: string | null;
  published_at: string | null;
  subjects: number;
  marks_entered: number;
  marks_expected: number;
};

export async function listExams(sql: Sql, schoolId: string, yearId: string): Promise<ExamRow[]> {
  return sql.many<ExamRow>(
    `select ex.id, ex.name, ex.exam_type, ex.status, ex.start_date, ex.end_date, ex.class_id, c.name as class_name, t.name as term_name, ex.published_at,
            (select count(*)::int from examination_subjects es where es.examination_id = ex.id) as subjects,
            (select count(*)::int from marks m join examination_subjects es on es.id = m.examination_subject_id where es.examination_id = ex.id) as marks_entered,
            ((select count(*) from examination_subjects es where es.examination_id = ex.id) *
             (select count(*) from enrollments e join sections sec on sec.id = e.section_id
              where sec.class_id = ex.class_id and sec.academic_year_id = ex.academic_year_id and e.status = 'active'))::int as marks_expected
     from examinations ex join classes c on c.id = ex.class_id left join terms t on t.id = ex.term_id
     where ex.school_id = $1 and ex.academic_year_id = $2
     order by coalesce(ex.start_date, ex.created_at::date) desc, c.grade_level`,
    [schoolId, yearId],
  );
}

export async function createExam(sql: Sql, schoolId: string, yearId: string, input: z.output<typeof examInput>) {
  const scale =
    input.gradeScaleId ??
    (await sql.maybeOne<{ id: string }>("select id from grade_scales where school_id = $1 and is_default", [schoolId]))?.id ??
    null;
  const ex = await sql.one<{ id: string }>(
    `insert into examinations (school_id, academic_year_id, term_id, class_id, grade_scale_id, name, exam_type, start_date, end_date, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled') returning id`,
    [schoolId, yearId, input.termId, input.classId, scale, input.name, input.examType, input.startDate, input.endDate],
  );
  for (const s of input.subjects.filter((x) => x.include)) {
    await sql.exec(
      `insert into examination_subjects (school_id, examination_id, subject_id, exam_date, max_marks, pass_marks) values ($1, $2, $3, $4, $5, $6)`,
      [schoolId, ex.id, s.subjectId, s.examDate, s.maxMarks, s.passMarks],
    );
  }
  return ex.id;
}

export async function getExam(sql: Sql, id: string) {
  return sql.one<{
    id: string;
    school_id: string;
    name: string;
    exam_type: string;
    status: string;
    class_id: string;
    class_name: string;
    academic_year_id: string;
    term_name: string | null;
    start_date: string | null;
    end_date: string | null;
    published_at: string | null;
    bands: GradeBand[] | null;
    scale_name: string | null;
  }>(
    `select ex.id, ex.school_id, ex.name, ex.exam_type, ex.status, ex.class_id, c.name as class_name, ex.academic_year_id, t.name as term_name,
            ex.start_date, ex.end_date, ex.published_at, gs.bands, gs.name as scale_name
     from examinations ex join classes c on c.id = ex.class_id left join terms t on t.id = ex.term_id
     left join grade_scales gs on gs.id = ex.grade_scale_id where ex.id = $1`,
    [id],
  );
}

export async function examSubjects(sql: Sql, examId: string) {
  return sql.many<{ id: string; subject_id: string; name: string; code: string; max_marks: number; pass_marks: number; exam_date: string | null; entered: number }>(
    `select es.id, es.subject_id, s.name, s.code, es.max_marks, es.pass_marks, es.exam_date,
            (select count(*)::int from marks m where m.examination_subject_id = es.id) as entered
     from examination_subjects es join subjects s on s.id = es.subject_id where es.examination_id = $1 order by s.name`,
    [examId],
  );
}

export async function setExamStatus(sql: Sql, schoolId: string, userId: string, examId: string, status: "scheduled" | "marks_entry" | "published") {
  if (status === "published") {
    const missing = await sql.one<{ n: number }>(
      `select count(*)::int as n from examination_subjects es
       cross join (select e.student_id from enrollments e join sections sec on sec.id = e.section_id
                   join examinations ex on ex.class_id = sec.class_id and ex.academic_year_id = sec.academic_year_id
                   where ex.id = $1 and e.status = 'active') st
       where es.examination_id = $1
         and not exists (select 1 from marks m where m.examination_subject_id = es.id and m.student_id = st.student_id)`,
      [examId],
    );
    if (missing.n > 0) throw new AppError(`${missing.n} marks are still missing. Enter marks (or mark students absent) before publishing.`);
  }
  const rows = await sql.many(
    `update examinations set status = $3, published_at = case when $3 = 'published' then now() else null end,
            published_by = case when $3 = 'published' then $4::uuid else null end
     where id = $1 and school_id = $2 returning id`,
    [examId, schoolId, status, userId],
  );
  if (!rows.length) throw new AppError("Examination not found", "not_found");
}

export type MarksRosterRow = {
  student_id: string;
  full_name: string;
  roll_no: number | null;
  section_label: string;
  section_id: string;
  mark_id: string | null;
  marks_obtained: number | null;
  is_absent: boolean | null;
  remarks: string | null;
};

/** Students of the exam's class (optionally one section) with any marks already entered for a subject. */
export async function marksRoster(sql: Sql, examSubjectId: string, sectionId: string | null): Promise<MarksRosterRow[]> {
  return sql.many<MarksRosterRow>(
    `select s.id as student_id, trim(s.first_name || ' ' || s.last_name) as full_name, e.roll_no, c.name || ' ' || sec.name as section_label, sec.id as section_id,
            m.id as mark_id, m.marks_obtained, m.is_absent, m.remarks
     from examination_subjects es
     join examinations ex on ex.id = es.examination_id
     join sections sec on sec.class_id = ex.class_id and sec.academic_year_id = ex.academic_year_id
     join classes c on c.id = sec.class_id
     join enrollments e on e.section_id = sec.id and e.status = 'active'
     join students s on s.id = e.student_id
     left join marks m on m.examination_subject_id = es.id and m.student_id = s.id
     where es.id = $1 and ($2::uuid is null or sec.id = $2)
     order by sec.name, e.roll_no nulls last, s.first_name`,
    [examSubjectId, sectionId],
  );
}

export async function saveMarks(sql: Sql, ctx: { userId: string; role: string; schoolId: string }, input: z.output<typeof marksEntryInput>) {
  const es = await sql.one<{ max_marks: number; status: string; school_id: string; subject_id: string }>(
    `select es.max_marks, ex.status, es.school_id, es.subject_id from examination_subjects es join examinations ex on ex.id = es.examination_id where es.id = $1`,
    [input.examSubjectId],
  );
  if (es.status === "draft") throw new AppError("This examination is still a draft.");
  if (es.status === "published") {
    if (ctx.role !== "school_admin") throw new ForbiddenError("Results are published. Only an administrator can correct marks.");
    if (!input.correctionReason || input.correctionReason.length < 3) throw new AppError("Give a reason for correcting published marks.");
  }
  const roster = await marksRoster(sql, input.examSubjectId, null);
  const byStudent = new Map(roster.map((r) => [r.student_id, r]));
  let saved = 0;
  for (const e of input.entries) {
    const current = byStudent.get(e.studentId);
    if (!current) throw new AppError("A student in the list is not in this class.");
    if (!e.absent && e.marks === null) continue; // left blank: not entered yet
    if (!e.absent && e.marks !== null && e.marks > es.max_marks) throw new AppError(`${current.full_name}: marks exceed the maximum of ${es.max_marks}.`);
    const marks = e.absent ? null : e.marks;
    const remarks = e.remarks || null;
    if (current.mark_id) {
      if (current.marks_obtained === marks && !!current.is_absent === e.absent && (current.remarks ?? null) === remarks) continue;
      await sql.exec("update marks set marks_obtained = $2, is_absent = $3, remarks = $4, entered_by = $5 where id = $1", [current.mark_id, marks, e.absent, remarks, ctx.userId]);
    } else {
      await sql.exec(
        "insert into marks (school_id, examination_subject_id, student_id, marks_obtained, is_absent, remarks, entered_by) values ($1, $2, $3, $4, $5, $6, $7)",
        [es.school_id, input.examSubjectId, e.studentId, marks, e.absent, remarks, ctx.userId],
      );
    }
    saved++;
  }
  // First marks move a scheduled exam into marks entry.
  if (es.status === "scheduled" && saved > 0) {
    await sql.exec("update examinations set status = 'marks_entry' where id = (select examination_id from examination_subjects where id = $1) and status = 'scheduled'", [input.examSubjectId]);
  }
  return saved;
}

export type StudentResult = {
  studentId: string;
  name: string;
  rollNo: number | null;
  sectionLabel: string;
  result: ReturnType<typeof computeExamResult>;
};

/** Results for every student the caller can see in an exam (RLS hides marks the caller may not see). */
export async function examResults(sql: Sql, examId: string, policy: AbsentPolicy) {
  const exam = await getExam(sql, examId);
  const subjects = await examSubjects(sql, examId);
  const marks = await sql.many<{ student_id: string; examination_subject_id: string; marks_obtained: number | null; is_absent: boolean }>(
    `select m.student_id, m.examination_subject_id, m.marks_obtained, m.is_absent from marks m
     join examination_subjects es on es.id = m.examination_subject_id where es.examination_id = $1`,
    [examId],
  );
  const students = await sql.many<{ id: string; name: string; roll_no: number | null; section_label: string }>(
    `select s.id, trim(s.first_name || ' ' || s.last_name) as name, e.roll_no, c.name || ' ' || sec.name as section_label
     from enrollments e join sections sec on sec.id = e.section_id join classes c on c.id = sec.class_id join students s on s.id = e.student_id
     where sec.class_id = $1 and sec.academic_year_id = $2 and e.status = 'active'
     order by sec.name, e.roll_no nulls last`,
    [exam.class_id, exam.academic_year_id],
  );
  const bands = exam.bands ?? [];
  const results: StudentResult[] = students.map((s) => ({
    studentId: s.id,
    name: s.name,
    rollNo: s.roll_no,
    sectionLabel: s.section_label,
    result: computeExamResult(
      subjects.map((sub) => {
        const m = marks.find((x) => x.student_id === s.id && x.examination_subject_id === sub.id);
        return { subjectId: sub.subject_id, maxMarks: sub.max_marks, passMarks: sub.pass_marks, marksObtained: m?.marks_obtained ?? null, isAbsent: m?.is_absent ?? false };
      }),
      bands,
      policy,
    ),
  }));
  const stats = subjects.map((sub) => ({
    subject: sub,
    stats: subjectStatistics(
      marks.filter((m) => m.examination_subject_id === sub.id).map((m) => ({ marksObtained: m.marks_obtained, isAbsent: m.is_absent })),
      sub.pass_marks,
    ),
  }));
  return { exam, subjects, results, stats };
}

/** Published (for families) or all (for staff) exams of the year with this student's result and the class average. */
export async function studentExamHistory(sql: Sql, studentId: string, yearId: string, policy: AbsentPolicy) {
  const exams = await sql.many<{ id: string }>(
    `select ex.id from examinations ex
     join sections sec on sec.class_id = ex.class_id and sec.academic_year_id = ex.academic_year_id
     join enrollments e on e.section_id = sec.id and e.student_id = $1
     where ex.academic_year_id = $2 and ex.status <> 'draft'
     order by coalesce(ex.start_date, ex.created_at::date)`,
    [studentId, yearId],
  );
  const out = [];
  for (const { id } of exams) {
    const exam = await getExam(sql, id);
    const subjects = await examSubjects(sql, id);
    // Only this student's marks are read; families cannot see anyone else's.
    const marks = await sql.many<{ examination_subject_id: string; marks_obtained: number | null; is_absent: boolean }>(
      `select m.examination_subject_id, m.marks_obtained, m.is_absent from marks m
       join examination_subjects es on es.id = m.examination_subject_id where es.examination_id = $1 and m.student_id = $2`,
      [id, studentId],
    );
    if (marks.length === 0) continue;
    const result = computeExamResult(
      subjects.map((sub) => {
        const m = marks.find((x) => x.examination_subject_id === sub.id);
        return { subjectId: sub.subject_id, maxMarks: sub.max_marks, passMarks: sub.pass_marks, marksObtained: m?.marks_obtained ?? null, isAbsent: m?.is_absent ?? false };
      }),
      exam.bands ?? [],
      policy,
    );
    // Aggregates only (security-definer function, published exams for families).
    const stats = await sql.many<{ subject_id: string; average: number | null; class_average_percent: number | null }>(
      "select subject_id, average, class_average_percent from exam_class_statistics($1)",
      [id],
    );
    out.push({
      exam,
      subjects,
      result,
      classAverage: stats[0]?.class_average_percent ?? null,
      subjectAverages: new Map(stats.map((s) => [s.subject_id, s.average])),
    });
  }
  return out;
}

export async function saveRemark(sql: Sql, schoolId: string, userId: string, input: { examinationId: string; studentId: string; remark: string }, source: "human" | "ai_draft") {
  await sql.exec(
    `insert into report_card_remarks (school_id, examination_id, student_id, remark, source, approved_by, approved_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (examination_id, student_id) do update set remark = excluded.remark, source = excluded.source,
       approved_by = excluded.approved_by, approved_at = excluded.approved_at`,
    [schoolId, input.examinationId, input.studentId, input.remark, source, source === "human" ? userId : null, source === "human" ? new Date().toISOString() : null],
  );
}

export async function approveRemark(sql: Sql, userId: string, examinationId: string, studentId: string) {
  const rows = await sql.many(
    "update report_card_remarks set approved_by = $3, approved_at = now() where examination_id = $1 and student_id = $2 returning id",
    [examinationId, studentId, userId],
  );
  if (!rows.length) throw new AppError("Remark not found", "not_found");
}
