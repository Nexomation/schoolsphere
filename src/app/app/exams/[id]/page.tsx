import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePageContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { examResults } from "@/lib/data/exams";
import { schoolProfile, teachingSections } from "@/lib/data/school";
import { formatDate, formatDateTime } from "@/lib/domain/dates";
import type { AbsentPolicy } from "@/lib/domain/grading";
import { setExamStatusAction } from "../actions";

export const metadata: Metadata = { title: "Examination" };

export default async function ExamPage({ params, searchParams }: PageProps<"/app/exams/[id]">) {
  const ctx = await requirePageContext("marks.enter");
  const { id } = await params;
  const sp = await searchParams;
  const d = await ctx.db(async (sql) => {
    const policy = ((await schoolProfile(sql, ctx.schoolId)).settings.absentPolicy as AbsentPolicy) ?? "absent_counts_as_zero";
    const r = await examResults(sql, id, policy).catch(() => null);
    if (!r) return null;
    const teaching =
      ctx.role === "teacher" ? await teachingSections(sql, ctx.schoolId, ctx.userId, r.exam.academic_year_id) : null;
    return { ...r, policy, teaching };
  });
  if (!d) notFound();
  const { exam } = d;
  const admin = can(ctx.role, "exams.manage");
  // Subjects a teacher may enter: those they teach in a section of this class.
  const canEnter = (subjectId: string) =>
    admin || !!d.teaching?.some((s) => s.class_id === exam.class_id && s.subjects.some((x) => x.id === subjectId));
  const visible = d.results.filter((r) => r.result.subjects.some((s) => s.entered));

  return (
    <>
      <PageHeader
        title={exam.name}
        description={`${exam.class_name}${exam.term_name ? ` · ${exam.term_name}` : ""}${exam.start_date ? ` · ${formatDate(exam.start_date)}` : ""} · Grading: ${exam.scale_name ?? "not set"}`}
        back={{ href: "/app/exams", label: "Exams" }}
        actions={
          admin && (
            <>
              <StatusBadge status={exam.status} />
              {exam.status !== "published" ? (
                <ConfirmAction
                  action={setExamStatusAction.bind(null, exam.id, "published")}
                  title="Publish results?"
                  description="Parents and students will be able to see marks, grades and the report card, and will be notified. Every student needs marks or an absent mark in every subject."
                  confirmLabel="Publish results"
                  triggerVariant="default"
                />
              ) : (
                <ConfirmAction
                  action={setExamStatusAction.bind(null, exam.id, "marks_entry")}
                  title="Withdraw results for correction?"
                  description="Families will no longer see these results until you publish again. Corrections made after publishing are recorded in the audit log."
                  confirmLabel="Withdraw"
                />
              )}
            </>
          )
        }
      />
      {exam.published_at && <p className="-mt-4 mb-6 text-sm text-muted-foreground">Published {formatDateTime(exam.published_at)}</p>}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Subjects</CardTitle>
          <CardDescription>Absent students are recorded as “AB”. Under the school policy ({d.policy === "absent_counts_as_zero" ? "absent counts as zero" : "absent subjects are excluded"}).</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead className="text-right">Max / pass</TableHead>
                <TableHead>Entered</TableHead>
                <TableHead className="hidden text-right md:table-cell">Average</TableHead>
                <TableHead className="hidden text-right md:table-cell">Highest</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Pass %</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.stats.map(({ subject: s, stats }) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right tabular">
                    {s.max_marks} / {s.pass_marks}
                  </TableCell>
                  <TableCell>
                    <div className="w-28">
                      <Progress value={d.results.length ? (s.entered / d.results.length) * 100 : 0} aria-label={`${s.name} entered`} />
                      <span className="text-xs text-muted-foreground tabular">
                        {s.entered}/{d.results.length}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-right tabular md:table-cell">{stats.average ?? "—"}</TableCell>
                  <TableCell className="hidden text-right tabular md:table-cell">{stats.highest ?? "—"}</TableCell>
                  <TableCell className="hidden text-right tabular lg:table-cell">{stats.passPercentage === null ? "—" : `${stats.passPercentage}%`}</TableCell>
                  <TableCell className="text-right">
                    {canEnter(s.subject_id) && (exam.status !== "published" || admin) && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/app/exams/${exam.id}/marks?subject=${s.id}`}>{exam.status === "published" ? "Correct" : "Enter marks"}</Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-base font-semibold">Results</h2>
      <DataTable
        rows={visible}
        rowKey={(r) => r.studentId}
        searchParams={sp}
        pageSize={50}
        search={{ placeholder: "Search student", text: (r) => r.name }}
        empty={{ title: "No marks entered yet" }}
        columns={[
          { key: "section", header: "Section", sort: (r) => r.sectionLabel, cell: (r) => r.sectionLabel, hideBelow: "md" },
          { key: "roll", header: "Roll", sort: (r) => r.rollNo, cell: (r) => r.rollNo ?? "—", align: "right", hideBelow: "sm" },
          { key: "name", header: "Student", sort: (r) => r.name, cell: (r) => <Link className="font-medium hover:text-primary hover:underline" href={`/app/exams/report-card/${r.studentId}?exam=${exam.id}`}>{r.name}</Link> },
          { key: "total", header: "Total", align: "right", sort: (r) => r.result.totalObtained, cell: (r) => `${r.result.totalObtained} / ${r.result.totalMax}` },
          { key: "pct", header: "%", align: "right", sort: (r) => r.result.percentage, cell: (r) => r.result.percentage ?? "—" },
          { key: "grade", header: "Grade", cell: (r) => r.result.grade?.grade ?? "—" },
          { key: "result", header: "Result", cell: (r) => <StatusBadge status={r.result.status} /> },
        ]}
      />
    </>
  );
}
