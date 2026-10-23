import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PrintButton } from "@/components/print-button";
import { StatusBadge, humanize } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { requirePageContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { studentAttendance } from "@/lib/data/attendance";
import { studentExamHistory } from "@/lib/data/exams";
import { currentYear, schoolProfile, schoolToday } from "@/lib/data/school";
import { formatDate } from "@/lib/domain/dates";
import type { AbsentPolicy } from "@/lib/domain/grading";
import { RemarkEditor } from "./remark-editor";

export const metadata: Metadata = { title: "Report card" };

export default async function ReportCardPage({ params }: PageProps<"/app/exams/report-card/[studentId]">) {
  const ctx = await requirePageContext("exams.view");
  const { studentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) notFound();
  const staff = can(ctx.role, "marks.enter");

  const d = await ctx.db(async (sql) => {
    const student = await sql.maybeOne<{ id: string; name: string; admission_no: string; date_of_birth: string; section_label: string | null; roll_no: number | null }>(
      `select s.id, trim(s.first_name || ' ' || s.last_name) as name, s.admission_no, s.date_of_birth,
              c.name || ' ' || sec.name as section_label, e.roll_no
       from students s left join enrollments e on e.student_id = s.id and e.status = 'active'
       left join sections sec on sec.id = e.section_id left join classes c on c.id = sec.class_id
       where s.id = $1`,
      [studentId],
    );
    if (!student) return null; // RLS: not your student or child
    const school = await schoolProfile(sql, ctx.schoolId);
    const year = await currentYear(sql, ctx.schoolId);
    const today = await schoolToday(sql, ctx.schoolId);
    const policy = (school.settings.absentPolicy as AbsentPolicy) ?? "absent_counts_as_zero";
    let history = await studentExamHistory(sql, studentId, year.id, policy);
    if (!staff) history = history.filter((h) => h.exam.status === "published");
    const remarks = await sql.many<{ examination_id: string; remark: string; source: "human" | "ai_draft"; approved_at: string | null }>(
      "select examination_id, remark, source, approved_at from report_card_remarks where student_id = $1",
      [studentId],
    );
    const attendance = await studentAttendance(sql, ctx.schoolId, studentId, year.start_date, today < year.end_date ? today : year.end_date);
    return { student, school, year, history, remarks, attendance: attendance.summary };
  });
  if (!d) notFound();
  const { student, school, history } = d;
  const subjects = [...new Map(history.flatMap((h) => h.subjects.map((s) => [s.subject_id, s.name] as const))).entries()];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={staff ? `/app/students/${student.id}` : "/app/exams"} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/app/activities/portfolio/${student.id}`}>Development report</Link>
          </Button>
          <PrintButton />
        </div>
      </div>

      <article className="print-sheet rounded-xl border bg-card p-6 shadow-sm sm:p-10">
        <header className="border-b pb-4 text-center">
          <h1 className="text-xl font-bold tracking-tight">{school.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[school.address_line1, school.city, school.pincode].filter(Boolean).join(", ")} · {humanize(school.board.toLowerCase())}
          </p>
          <p className="mt-2 text-sm font-semibold tracking-wide uppercase">Progress report · {d.year.name}</p>
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 py-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Student</dt>
            <dd className="font-medium">{student.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Class</dt>
            <dd className="font-medium">{student.section_label ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Admission no / Roll</dt>
            <dd className="font-medium">
              {student.admission_no} / {student.roll_no ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Date of birth</dt>
            <dd className="font-medium">{formatDate(student.date_of_birth)}</dd>
          </div>
        </dl>

        {history.length === 0 ? (
          <EmptyState title="No results to show yet" description={staff ? "No marks have been entered for this student." : "Results appear after the school publishes them."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/60">
                  <th className="border px-2 py-1.5 text-left">Subject</th>
                  {history.map((h) => (
                    <th key={h.exam.id} className="border px-2 py-1.5 text-center" colSpan={2}>
                      {h.exam.name}
                      {h.exam.status !== "published" && <span className="block text-[10px] font-normal text-warning">not published</span>}
                    </th>
                  ))}
                </tr>
                <tr className="bg-muted/30 text-xs text-muted-foreground">
                  <th className="border px-2 py-1" />
                  {history.map((h) => [
                    <th key={`${h.exam.id}m`} className="border px-2 py-1 text-right font-normal">
                      Marks
                    </th>,
                    <th key={`${h.exam.id}g`} className="border px-2 py-1 font-normal">
                      Grade
                    </th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {subjects.map(([subjectId, name]) => (
                  <tr key={subjectId}>
                    <td className="border px-2 py-1.5 font-medium">{name}</td>
                    {history.map((h) => {
                      const sub = h.subjects.find((s) => s.subject_id === subjectId);
                      const r = h.result.subjects.find((s) => s.subjectId === subjectId);
                      const grade = r?.percent !== null && r?.percent !== undefined && h.exam.bands ? h.exam.bands.slice().sort((a, b) => b.minPercent - a.minPercent).find((b) => r.percent! >= b.minPercent)?.grade : null;
                      return [
                        <td key={`${h.exam.id}m`} className={`border px-2 py-1.5 text-right tabular ${r && !r.passed && r.entered ? "text-destructive" : ""}`}>
                          {!sub ? "—" : r?.isAbsent ? "AB" : r?.marksObtained === null || r?.marksObtained === undefined ? "—" : `${r.marksObtained}/${sub.max_marks}`}
                        </td>,
                        <td key={`${h.exam.id}g`} className="border px-2 py-1.5">
                          {r?.isAbsent ? "—" : grade ?? "—"}
                        </td>,
                      ];
                    })}
                  </tr>
                ))}
                <tr className="bg-muted/30 font-semibold">
                  <td className="border px-2 py-1.5">Total</td>
                  {history.map((h) => [
                    <td key={`${h.exam.id}t`} className="border px-2 py-1.5 text-right tabular">
                      {h.result.totalObtained}/{h.result.totalMax}
                    </td>,
                    <td key={`${h.exam.id}p`} className="border px-2 py-1.5">
                      {h.result.percentage}% · {h.result.grade?.grade}
                    </td>,
                  ])}
                </tr>
                <tr>
                  <td className="border px-2 py-1.5 text-muted-foreground">Result</td>
                  {history.map((h) => (
                    <td key={h.exam.id} colSpan={2} className="border px-2 py-1.5">
                      <StatusBadge status={h.result.status} />
                      {h.classAverage !== null && <span className="ml-2 text-xs text-muted-foreground">Class average {h.classAverage}%</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border p-3 text-sm">
            <h2 className="mb-1 font-semibold">Attendance (year to date)</h2>
            <p>
              {d.attendance.attended} of {d.attendance.countedDays} recorded days · {d.attendance.percentage === null ? "—" : `${d.attendance.percentage}%`}
            </p>
            <p className="text-xs text-muted-foreground">{d.attendance.workingDays} working days so far; holidays excluded.</p>
          </div>
          <div className="rounded-lg border p-3 text-sm">
            <h2 className="mb-1 font-semibold">Grading key</h2>
            <p className="text-xs text-muted-foreground">
              {(history.at(-1)?.exam.bands ?? []).map((b) => `${b.grade} ≥ ${b.minPercent}%`).join(" · ") || "—"}. AB = absent.
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-4">
          <h2 className="font-semibold">Class teacher&apos;s remarks</h2>
          {history.map((h) => {
            const r = d.remarks.find((x) => x.examination_id === h.exam.id);
            const visibleToFamily = r?.approved_at;
            return (
              <div key={h.exam.id} className="text-sm">
                <p className="text-xs font-medium text-muted-foreground">{h.exam.name}</p>
                {staff ? (
                  <RemarkEditor examinationId={h.exam.id} studentId={student.id} initial={r?.remark ?? ""} source={r?.source ?? null} approved={!!r?.approved_at} />
                ) : null}
                {(staff ? r?.approved_at : visibleToFamily) ? <p className={staff ? "hidden print:block" : ""}>{r!.remark}</p> : !staff && <p className="text-muted-foreground">—</p>}
              </div>
            );
          })}
        </section>

        <footer className="mt-12 grid grid-cols-3 gap-6 text-center text-xs text-muted-foreground">
          {["Class teacher", "Principal", "Parent / guardian"].map((s) => (
            <div key={s} className="border-t pt-1">
              {s}
            </div>
          ))}
        </footer>
      </article>
    </div>
  );
}
