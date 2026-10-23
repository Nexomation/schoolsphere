import "server-only";
import { z } from "zod";
import type { SchoolContext } from "../auth/context";
import { can } from "../auth/permissions";
import { summarizeAttendance } from "../domain/attendance";
import { addDays, formatDate, monthRange } from "../domain/dates";
import { formatINR } from "../domain/money";
import { ForbiddenError, NotFoundError } from "../errors";
import { attendancePolicy, holidays, schoolToday } from "../data/school";
import { AiUnavailableError, generateText, SCHOOL_SYSTEM_RULES } from "./provider";

export type AiResult = {
  text: string;
  source: "ai" | "template";
  provider: string;
  model: string | null;
  /** Shown with the result so staff know what was (and was not) sent to the AI provider. */
  dataShared: string;
  generationId?: string;
};

async function withFallback(
  ctx: SchoolContext,
  feature: string,
  inputSummary: string,
  dataShared: string,
  request: { system: string; prompt: string; maxTokens?: number },
  template: () => string,
): Promise<AiResult> {
  let result: AiResult;
  try {
    const r = await generateText(request);
    result = { text: r.text, source: "ai", provider: r.provider, model: r.model, dataShared };
  } catch (error) {
    if (!(error instanceof AiUnavailableError)) throw error;
    result = { text: template(), source: "template", provider: "template", model: null, dataShared: "Nothing — generated on the server from school records without an AI service." };
  }
  // Every output is stored as a draft so its use can be reviewed later.
  const row = await ctx.db((sql) =>
    sql.one<{ id: string }>(
      `insert into ai_generations (school_id, user_id, feature, input_summary, output, provider, model) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [ctx.schoolId, ctx.userId, feature, inputSummary.slice(0, 500), result.text, result.provider, result.model],
    ),
  );
  return { ...result, generationId: row.id };
}

// ------------------------------------------------------------------ worksheets
export const worksheetInput = z.object({
  grade: z.string().trim().min(1).max(20),
  subject: z.string().trim().min(2).max(60),
  topic: z.string().trim().min(2).max(160),
  count: z.coerce.number().int().min(3).max(20),
  difficulty: z.enum(["easy", "mixed", "challenging"]),
  format: z.enum(["mixed", "short_answer", "mcq", "word_problems"]),
});

export async function generateWorksheet(ctx: SchoolContext, input: z.output<typeof worksheetInput>) {
  const prompt = `Create a homework worksheet.
Class: ${input.grade}
Subject: ${input.subject}
Topic: ${input.topic}
Number of questions: ${input.count}
Difficulty: ${input.difficulty}
Question format: ${input.format.replace("_", " ")}
Follow the ${input.subject.toLowerCase().includes("tamil") ? "Tamil Nadu State Board" : "CBSE / Tamil Nadu State Board"} level for this class. Use Indian names, places and rupees in word problems.
Output: a title line, short instructions for students, numbered questions, then a separate "Answer key" section for the teacher.`;
  return withFallback(
    ctx,
    "worksheet",
    `${input.grade} ${input.subject}: ${input.topic}`,
    "Class, subject, topic and the options you chose. No student data.",
    { system: `${SCHOOL_SYSTEM_RULES}\nYou write age-appropriate, syllabus-aligned practice questions.`, prompt, maxTokens: 6000 },
    () =>
      [
        `${input.subject} worksheet — ${input.topic} (${input.grade})`,
        "",
        "Instructions: Answer all questions in your notebook. Show your working.",
        "",
        ...Array.from({ length: input.count }, (_, i) => `${i + 1}. ________________________________________________`),
        "",
        "Answer key (teacher): ______________",
        "",
        "[Template only — AI is not configured, so questions were not generated. Type your questions above, or ask the administrator to set AI_PROVIDER and an API key.]",
      ].join("\n"),
  );
}

// ------------------------------------------------------------------ circulars
export const circularInput = z.object({
  purpose: z.string().trim().min(3).max(200),
  details: z.string().trim().min(3).max(2000),
  audience: z.enum(["parents", "staff", "students", "everyone"]),
  tone: z.enum(["formal", "friendly", "urgent"]),
});

export async function draftCircular(ctx: SchoolContext, input: z.output<typeof circularInput>) {
  return withFallback(
    ctx,
    "circular",
    input.purpose,
    "Only the purpose and details you typed (do not include children's personal details).",
    {
      system: `${SCHOOL_SYSTEM_RULES}\nYou draft short school circulars. Start with a one-line subject, then the body. Do not add facts that are not in the details. Sign off as "Principal, ${ctx.active.schoolName}".`,
      prompt: `Draft a ${input.tone} circular for ${input.audience}.\nPurpose: ${input.purpose}\nDetails provided by the school:\n${input.details}`,
      maxTokens: 2000,
    },
    () =>
      [
        `Subject: ${input.purpose}`,
        "",
        `Dear ${input.audience === "parents" ? "Parents" : input.audience === "staff" ? "Colleagues" : input.audience === "students" ? "Students" : "Parents, students and staff"},`,
        "",
        input.details,
        "",
        "Thank you for your cooperation.",
        "",
        `Principal, ${ctx.active.schoolName}`,
      ].join("\n"),
  );
}

// ------------------------------------------------------------------ class trends
async function sectionAggregates(ctx: SchoolContext, sectionId: string) {
  return ctx.db(async (sql) => {
    // Authorization first: RLS hides other sections' data, and this explicit check
    // stops a teacher from analysing a section they do not teach.
    const allowed = await sql.one<{ ok: boolean; label: string | null }>(
      `select (app.has_role(sec.school_id, 'school_admin') or app.teaches_section(sec.id)) as ok, c.name || ' ' || sec.name as label
       from sections sec join classes c on c.id = sec.class_id where sec.id = $1`,
      [sectionId],
    ).catch(() => null);
    if (!allowed) throw new NotFoundError();
    if (!allowed.ok) throw new ForbiddenError("You can only analyse sections you teach.");
    const today = await schoolToday(sql, ctx.schoolId);
    const from = addDays(today, -28);
    const policy = await attendancePolicy(sql, ctx.schoolId);
    const hol = await holidays(sql, ctx.schoolId, from, today);
    const records = await sql.many<{ student_id: string; date: string; status: "present" | "absent" | "late" | "excused" }>(
      "select student_id, attendance_date as date, status from attendance_records where section_id = $1 and subject_id is null and attendance_date between $2 and $3",
      [sectionId, from, today],
    );
    const students = [...new Set(records.map((r) => r.student_id))];
    const perStudent = students.map((s) => summarizeAttendance(records.filter((r) => r.student_id === s), { from, to: today }, policy, hol));
    const weekly = [0, 1, 2, 3].map((w) => {
      const wf = addDays(today, -7 * (w + 1) + 1);
      const wt = addDays(today, -7 * w);
      const s = summarizeAttendance(records.filter((r) => r.date >= wf && r.date <= wt), { from: wf, to: wt }, policy, hol);
      return { week: `${formatDate(wf)} – ${formatDate(wt)}`, percentage: s.percentage };
    }).reverse();
    const hw = await sql.one<{ assignments: number; expected: number; submitted: number; late: number }>(
      `select count(*)::int as assignments,
              coalesce(sum((select count(*) from enrollments e where e.section_id = a.section_id and e.status = 'active')), 0)::int as expected,
              coalesce(sum((select count(*) from assignment_submissions s where s.assignment_id = a.id)), 0)::int as submitted,
              coalesce(sum((select count(*) from assignment_submissions s where s.assignment_id = a.id and s.is_late)), 0)::int as late
       from assignments a where a.section_id = $1 and a.status <> 'draft' and a.due_at between $2::date and now()`,
      [sectionId, from],
    );
    const subjects = await sql.many<{ exam: string; subject: string; average: number | null; pass_pct: number | null }>(
      `select ex.name as exam, s.name as subject,
              round(avg(m.marks_obtained / es.max_marks * 100) filter (where not m.is_absent), 1)::float8 as average,
              round(100.0 * count(*) filter (where not m.is_absent and m.marks_obtained >= es.pass_marks) / nullif(count(*) filter (where not m.is_absent), 0), 1)::float8 as pass_pct
       from examinations ex join examination_subjects es on es.examination_id = ex.id join subjects s on s.id = es.subject_id
       join marks m on m.examination_subject_id = es.id
       join enrollments e on e.student_id = m.student_id and e.section_id = $1
       where ex.status = 'published' and ex.published_at = (
         select max(x.published_at) from examinations x join sections sec on sec.class_id = x.class_id and sec.academic_year_id = x.academic_year_id where sec.id = $1 and x.status = 'published')
       group by ex.name, s.name order by s.name`,
      [sectionId],
    );
    const pcts = perStudent.map((p) => p.percentage).filter((p): p is number => p !== null);
    return {
      label: allowed.label!,
      studentsWithRecords: students.length,
      attendanceAverage: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null,
      belowThreshold: pcts.filter((p) => p < policy.lowAttendanceThreshold).length,
      threshold: policy.lowAttendanceThreshold,
      weekly,
      homework: { ...hw, completion: hw.expected ? Math.round((hw.submitted / hw.expected) * 100) : null },
      subjects,
    };
  });
}

export async function classTrends(ctx: SchoolContext, sectionId: string) {
  if (!can(ctx.role, "ai.use") || ctx.role === "accountant") throw new ForbiddenError();
  const a = await sectionAggregates(ctx, sectionId);
  const data = JSON.stringify({ ...a, label: undefined }, null, 1);
  const fallback = () => {
    const lines = [`Class trends for ${a.label} (last 4 weeks, from school records)`, ""];
    lines.push(`Attendance: average ${a.attendanceAverage ?? "—"}% across ${a.studentsWithRecords} students; ${a.belowThreshold} below the ${a.threshold}% threshold.`);
    lines.push(`Weekly: ${a.weekly.map((w) => `${w.week}: ${w.percentage ?? "—"}%`).join("; ")}.`);
    lines.push(`Homework: ${a.homework.assignments} assignments due, ${a.homework.completion ?? "—"}% submitted (${a.homework.late} late).`);
    if (a.subjects.length) {
      const sorted = [...a.subjects].filter((s) => s.average !== null).sort((x, y) => (y.average ?? 0) - (x.average ?? 0));
      lines.push(`Latest results (${a.subjects[0].exam}): strongest ${sorted[0]?.subject} (${sorted[0]?.average}%), weakest ${sorted.at(-1)?.subject} (${sorted.at(-1)?.average}%).`);
    }
    lines.push("", "Suggested focus: follow up with families of students below the attendance threshold, and plan a revision session for the weakest subject.");
    return lines.join("\n");
  };
  return withFallback(
    ctx,
    "class_trends",
    `Section ${a.label}`,
    "Section-level totals and averages only (attendance rates, homework completion, subject averages). No student names or individual records.",
    {
      system: SCHOOL_SYSTEM_RULES,
      prompt: `Summarise these class-level trends for the teacher in under 200 words: what is going well, what needs attention, and 2–3 practical suggestions. Data (anonymised aggregates):\n${data}`,
      maxTokens: 1500,
    },
    fallback,
  );
}

// ------------------------------------------------------------------ student summary
export async function studentWeeklySummary(ctx: SchoolContext, studentId: string) {
  if (ctx.role !== "teacher" && ctx.role !== "school_admin") throw new ForbiddenError();
  const d = await ctx.db(async (sql) => {
    // RLS: the row is only visible if this teacher teaches the student (or admin).
    const s = await sql.maybeOne<{ first_name: string; section_id: string | null }>(
      `select s.first_name, e.section_id from students s left join enrollments e on e.student_id = s.id and e.status = 'active' where s.id = $1 and app.can_view_student(s.school_id, s.id) and (app.has_role(s.school_id, 'school_admin') or app.teaches_student(s.id))`,
      [studentId],
    );
    if (!s) throw new NotFoundError();
    const today = await schoolToday(sql, ctx.schoolId);
    const policy = await attendancePolicy(sql, ctx.schoolId);
    const weekFrom = addDays(today, -6);
    const monthFrom = monthRange(today.slice(0, 7)).from;
    const records = await sql.many<{ date: string; status: "present" | "absent" | "late" | "excused" }>(
      "select attendance_date as date, status from attendance_records where student_id = $1 and subject_id is null and attendance_date >= $2",
      [studentId, monthFrom < weekFrom ? monthFrom : weekFrom],
    );
    const hol = await holidays(sql, ctx.schoolId, monthFrom, today);
    const homework = await sql.one<{ due: number; submitted: number; late: number; avg_pct: number | null }>(
      `select count(*)::int as due, count(sub.id)::int as submitted, count(sub.id) filter (where sub.is_late)::int as late,
              round(avg(sub.marks_awarded / a.max_marks * 100) filter (where sub.marks_awarded is not null), 1)::float8 as avg_pct
       from assignments a left join assignment_submissions sub on sub.assignment_id = a.id and sub.student_id = $1
       where a.section_id = $2 and a.status <> 'draft' and a.due_at between $3::date and now()`,
      [studentId, s.section_id, addDays(today, -28)],
    );
    const exam = await sql.many<{ subject: string; pct: number | null; absent: boolean; class_avg: number | null }>(
      `with latest as (
         select ex.id from examinations ex join examination_subjects es on es.examination_id = ex.id join marks m on m.examination_subject_id = es.id
         where m.student_id = $1 and ex.status = 'published' order by ex.published_at desc limit 1)
       select sub.name as subject, round(m.marks_obtained / es.max_marks * 100, 1)::float8 as pct, m.is_absent,
              (select round(avg(m2.marks_obtained / es.max_marks * 100), 1)::float8 from marks m2 where m2.examination_subject_id = es.id and not m2.is_absent) as class_avg
       from examination_subjects es join subjects sub on sub.id = es.subject_id join marks m on m.examination_subject_id = es.id and m.student_id = $1
       where es.examination_id = (select id from latest) order by sub.name`,
      [studentId],
    );
    return {
      firstName: s.first_name,
      week: summarizeAttendance(records, { from: weekFrom, to: today }, policy, hol),
      month: summarizeAttendance(records, { from: monthFrom, to: today }, policy, hol),
      homework,
      exam,
    };
  });
  const anonymised = {
    attendanceThisWeek: { attended: d.week.attended, counted: d.week.countedDays, percentage: d.week.percentage },
    attendanceThisMonth: d.month.percentage,
    homeworkLast4Weeks: d.homework,
    latestExamBySubject: d.exam.map((e) => ({ subject: e.subject, percent: e.absent ? "absent" : e.pct, classAverage: e.class_avg })),
  };
  const fallback = () => {
    const lines = [`Weekly progress — ${d.firstName}`, ""];
    lines.push(`Attendance: ${d.week.attended} of ${d.week.countedDays} recorded days this week; ${d.month.percentage ?? "—"}% this month.`);
    lines.push(`Homework (last 4 weeks): ${d.homework.submitted} of ${d.homework.due} submitted${d.homework.late ? `, ${d.homework.late} late` : ""}${d.homework.avg_pct !== null ? `; average score ${d.homework.avg_pct}%` : ""}.`);
    const above = d.exam.filter((e) => e.pct !== null && e.class_avg !== null && e.pct >= e.class_avg).map((e) => e.subject);
    const below = d.exam.filter((e) => e.pct !== null && e.class_avg !== null && e.pct < e.class_avg - 10).map((e) => e.subject);
    if (d.exam.length) lines.push(`Latest exam: at or above class average in ${above.join(", ") || "none"}; well below in ${below.join(", ") || "none"}.`);
    lines.push("", below.length ? `Suggestion: extra practice in ${below.join(", ")}.` : "Suggestion: keep up the current routine.");
    return lines.join("\n");
  };
  const result = await withFallback(
    ctx,
    "student_summary",
    "Weekly summary for one student",
    "Anonymised figures for one student (attendance counts, homework counts, subject percentages with class averages). The name was NOT sent.",
    {
      system: SCHOOL_SYSTEM_RULES,
      prompt: `Write a short weekly progress note (under 150 words) about "the student" for their class teacher, then 2 supportive suggestions. Base it only on this data:\n${JSON.stringify(anonymised, null, 1)}`,
      maxTokens: 1200,
    },
    fallback,
  );
  // Put the real first name back only on our side, after generation.
  return { ...result, text: result.text.replaceAll("the student", d.firstName).replaceAll("The student", d.firstName) };
}

// ------------------------------------------------------------------ report explainer
export async function explainReport(ctx: SchoolContext, kind: "fees" | "attendance") {
  if (kind === "fees" && !can(ctx.role, "fees.manage")) throw new ForbiddenError();
  if (kind === "attendance" && ctx.role !== "school_admin") throw new ForbiddenError();
  const data = await ctx.db(async (sql) => {
    const today = await schoolToday(sql, ctx.schoolId);
    const { from } = monthRange(today.slice(0, 7));
    if (kind === "fees") {
      return sql.one<{ billed: number; collected: number; outstanding: number; overdue: number; overdue_students: number; month_collected: number; offline_share: number | null }>(
        `select coalesce(sum(net_paise), 0) as billed, coalesce(sum(paid_paise), 0) as collected, coalesce(sum(balance_paise), 0) as outstanding,
                coalesce(sum(balance_paise) filter (where due_date < $2), 0) as overdue,
                count(distinct student_id) filter (where balance_paise > 0 and due_date < $2)::int as overdue_students,
                (select coalesce(sum(amount_paise), 0) from payments where school_id = $1 and status = 'captured' and paid_at >= $3::date) as month_collected,
                (select round(100.0 * count(*) filter (where mode = 'offline') / nullif(count(*), 0), 1)::float8 from payments where school_id = $1 and status = 'captured') as offline_share
         from student_fee_balances where school_id = $1`,
        [ctx.schoolId, today, from],
      );
    }
    return sql.many<{ section: string; rate: number | null; absent: number }>(
      `select c.name || ' ' || sec.name as section,
              round(100.0 * count(*) filter (where a.status in ('present', 'late')) / nullif(count(*) filter (where a.status <> 'excused'), 0), 1)::float8 as rate,
              count(*) filter (where a.status = 'absent')::int as absent
       from attendance_records a join sections sec on sec.id = a.section_id join classes c on c.id = sec.class_id
       where a.school_id = $1 and a.subject_id is null and a.attendance_date >= $2 group by c.name, sec.name, c.grade_level order by c.grade_level, sec.name`,
      [ctx.schoolId, from],
    );
  });
  const readable =
    kind === "fees"
      ? (() => {
          const f = data as { billed: number; collected: number; outstanding: number; overdue: number; overdue_students: number; month_collected: number; offline_share: number | null };
          return `Billed this year: ${formatINR(f.billed)}. Collected: ${formatINR(f.collected)} (${f.billed ? Math.round((f.collected / f.billed) * 100) : 0}%). Outstanding: ${formatINR(f.outstanding)}, of which ${formatINR(f.overdue)} is overdue across ${f.overdue_students} students. Collected this month: ${formatINR(f.month_collected)}. Counter payments are ${f.offline_share ?? "—"}% of receipts.`;
        })()
      : (data as { section: string; rate: number | null; absent: number }[]).map((r) => `${r.section}: ${r.rate ?? "—"}% (${r.absent} absences)`).join("; ");
  return withFallback(
    ctx,
    "report_explainer",
    `${kind} report`,
    "School-level totals only (no student names).",
    { system: SCHOOL_SYSTEM_RULES, prompt: `Explain this ${kind} report to a school principal in plain language (under 180 words), point out anything unusual, and suggest 2 actions:\n${readable}`, maxTokens: 1200 },
    () => `${kind === "fees" ? "Fee collection" : "Attendance this month"} — from school records\n\n${readable}`,
  );
}

// ------------------------------------------------------------------ "find information"
export const QUERY_INTENTS = {
  absent_today: "Which students are absent today?",
  attendance_today: "How is attendance today?",
  overdue_fees: "Who has overdue fees?",
  homework_pending: "Which homework still needs reviewing?",
  upcoming_events: "What events are coming up?",
} as const;
export type QueryIntent = keyof typeof QUERY_INTENTS;

function matchIntent(q: string): QueryIntent | null {
  const s = q.toLowerCase();
  if (/absent|missing|not present/.test(s)) return "absent_today";
  if (/attendance/.test(s)) return "attendance_today";
  if (/fee|due|dues|balance|overdue|payment/.test(s)) return "overdue_fees";
  if (/homework|assignment|submission|review|grade/.test(s)) return "homework_pending";
  if (/event|holiday|exam date|calendar|upcoming|ptm/.test(s)) return "upcoming_events";
  return null;
}

/**
 * Answers questions from verified school records. The intent is matched by
 * rules (or, if configured, the AI chooses ONLY an intent name — it never sees
 * school data). The answer itself is built from database rows read with the
 * user's own RLS scope, so it can only contain what the user may see.
 */
export async function answerQuestion(ctx: SchoolContext, question: string): Promise<{ intent: QueryIntent | null; answer: string; rows: string[]; classifiedBy: "rules" | "ai" | "none" }> {
  let intent = matchIntent(question);
  let classifiedBy: "rules" | "ai" | "none" = intent ? "rules" : "none";
  if (!intent) {
    try {
      const r = await generateText({
        system: "Classify the user's question into exactly one of these intent names, or NONE. Reply with the name only.",
        prompt: `Intents: ${Object.keys(QUERY_INTENTS).join(", ")}\nQuestion: ${question.slice(0, 300)}`,
        maxTokens: 20,
        effort: "low",
      });
      const name = r.text.trim().toLowerCase() as QueryIntent;
      if (name in QUERY_INTENTS) {
        intent = name;
        classifiedBy = "ai";
      }
    } catch {
      // No AI configured: only rule-based matching.
    }
  }
  if (!intent) return { intent: null, answer: `I can answer questions like: ${Object.values(QUERY_INTENTS).join(" · ")}`, rows: [], classifiedBy };

  return ctx.db(async (sql) => {
    const today = await schoolToday(sql, ctx.schoolId);
    switch (intent) {
      case "absent_today": {
        if (!can(ctx.role, "attendance.mark")) throw new ForbiddenError();
        const rows = await sql.many<{ name: string; section: string }>(
          `select trim(s.first_name || ' ' || s.last_name) as name, c.name || ' ' || sec.name as section from attendance_records a
           join students s on s.id = a.student_id join sections sec on sec.id = a.section_id join classes c on c.id = sec.class_id
           where a.attendance_date = $1 and a.status = 'absent' and a.subject_id is null order by c.grade_level, sec.name, s.first_name`,
          [today],
        );
        return { intent, classifiedBy, answer: `${rows.length} student${rows.length === 1 ? " is" : "s are"} marked absent today in the sections you can see.`, rows: rows.map((r) => `${r.name} — ${r.section}`) };
      }
      case "attendance_today": {
        const r = await sql.one<{ total: number; attended: number; sections: number }>(
          `select count(*)::int as total, count(*) filter (where status in ('present', 'late'))::int as attended, count(distinct section_id)::int as sections
           from attendance_records where attendance_date = $1 and subject_id is null`,
          [today],
        );
        return { intent, classifiedBy, answer: r.total ? `${r.attended} of ${r.total} students marked so far are present (${Math.round((r.attended / r.total) * 100)}%), across ${r.sections} sections.` : "No attendance has been recorded yet today.", rows: [] };
      }
      case "overdue_fees": {
        if (!can(ctx.role, "fees.manage")) throw new ForbiddenError("Fee information is available to the office and accounts staff only.");
        const rows = await sql.many<{ name: string; overdue: number }>(
          `select trim(s.first_name || ' ' || s.last_name) as name, sum(b.balance_paise)::bigint as overdue from student_fee_balances b join students s on s.id = b.student_id
           where b.balance_paise > 0 and b.due_date < $1 group by s.id, s.first_name, s.last_name order by overdue desc limit 25`,
          [today],
        );
        return { intent, classifiedBy, answer: `${rows.length}${rows.length === 25 ? "+" : ""} students have overdue fees (largest first).`, rows: rows.map((r) => `${r.name} — ${formatINR(r.overdue)}`) };
      }
      case "homework_pending": {
        const rows = await sql.many<{ title: string; section: string; n: number }>(
          `select a.title, c.name || ' ' || sec.name as section, count(s.id)::int as n from assignments a
           join sections sec on sec.id = a.section_id join classes c on c.id = sec.class_id
           join assignment_submissions s on s.assignment_id = a.id and s.status = 'submitted'
           group by a.id, a.title, c.name, sec.name order by n desc limit 20`,
        );
        return { intent, classifiedBy, answer: `${rows.reduce((t, r) => t + r.n, 0)} submissions are waiting for review.`, rows: rows.map((r) => `${r.title} (${r.section}) — ${r.n}`) };
      }
      case "upcoming_events": {
        const rows = await sql.many<{ title: string; start_date: string }>(
          "select title, start_date from calendar_events where school_id = $1 and end_date >= $2 and start_date <= $2::date + 30 order by start_date",
          [ctx.schoolId, today],
        );
        return { intent, classifiedBy, answer: rows.length ? "Coming up in the next 30 days:" : "Nothing is scheduled in the next 30 days.", rows: rows.map((r) => `${formatDate(r.start_date)} — ${r.title}`) };
      }
    }
  });
}
