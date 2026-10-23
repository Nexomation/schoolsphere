import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { ComparisonBarChart } from "@/components/charts";
import { DataTable, type SearchParams } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { UrlPicker } from "@/components/url-controls";
import { requirePageContext, type SchoolContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listExams, studentExamHistory } from "@/lib/data/exams";
import { currentYear, familyChildren, pickChild, schoolProfile } from "@/lib/data/school";
import { formatDate } from "@/lib/domain/dates";
import type { AbsentPolicy } from "@/lib/domain/grading";

export const metadata: Metadata = { title: "Exams & results" };

const EXAM_STATUS_LABEL: Record<string, string> = { draft: "Draft", scheduled: "Scheduled", marks_entry: "Marks entry", published: "Published" };

export default async function ExamsPage({ searchParams }: PageProps<"/app/exams">) {
  const ctx = await requirePageContext("exams.view");
  const sp = await searchParams;
  if (ctx.role === "parent" || ctx.role === "student") return <FamilyResults ctx={ctx} sp={sp} />;
  const rows = await ctx.db(async (sql) => listExams(sql, ctx.schoolId, (await currentYear(sql, ctx.schoolId)).id));
  return (
    <>
      <PageHeader
        title="Exams & results"
        description="Schedule examinations, enter marks and publish results. Families see results only after publishing."
        actions={
          can(ctx.role, "exams.manage") && (
            <Button asChild size="sm">
              <Link href="/app/exams/new">
                <Plus aria-hidden /> New examination
              </Link>
            </Button>
          )
        }
      />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        searchParams={sp}
        filters={[
          { param: "status", label: "Status", options: Object.entries(EXAM_STATUS_LABEL).map(([value, label]) => ({ value, label })), match: (r, v) => r.status === v },
          { param: "class", label: "Class", options: [...new Map(rows.map((r) => [r.class_id, r.class_name]))].map(([value, label]) => ({ value, label })), match: (r, v) => r.class_id === v },
        ]}
        empty={{ title: "No examinations yet", description: can(ctx.role, "exams.manage") ? "Schedule the first examination for a class." : "Your administrator has not scheduled any examinations." }}
        columns={[
          {
            key: "name",
            header: "Examination",
            cell: (r) => (
              <Link href={`/app/exams/${r.id}`} className="block hover:text-primary">
                <span className="font-medium">{r.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.class_name}
                  {r.term_name ? ` · ${r.term_name}` : ""}
                </span>
              </Link>
            ),
          },
          { key: "dates", header: "Dates", cell: (r) => (r.start_date ? `${formatDate(r.start_date)}${r.end_date && r.end_date !== r.start_date ? ` – ${formatDate(r.end_date)}` : ""}` : "—"), hideBelow: "md" },
          {
            key: "progress",
            header: "Marks entered",
            cell: (r) => (
              <div className="w-32">
                <Progress value={r.marks_expected ? (r.marks_entered / r.marks_expected) * 100 : 0} aria-label="Marks entered" />
                <span className="text-xs text-muted-foreground tabular">
                  {r.marks_entered}/{r.marks_expected}
                </span>
              </div>
            ),
          },
          { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} label={EXAM_STATUS_LABEL[r.status]} /> },
        ]}
      />
    </>
  );
}

async function FamilyResults({ ctx, sp }: { ctx: SchoolContext; sp: SearchParams }) {
  const d = await ctx.db(async (sql) => {
    const children = await familyChildren(sql, ctx.schoolId);
    const child = pickChild(children, sp.child);
    const year = await currentYear(sql, ctx.schoolId);
    const policy = ((await schoolProfile(sql, ctx.schoolId)).settings.absentPolicy as AbsentPolicy) ?? "absent_counts_as_zero";
    return { children, child, history: child ? await studentExamHistory(sql, child.id, year.id, policy) : [] };
  });
  if (!d.child) return <EmptyState title="No linked children" />;
  const published = d.history.filter((h) => h.exam.status === "published");
  const latest = published.at(-1);

  return (
    <>
      <PageHeader
        title="Exams & results"
        description={`${d.child.full_name} · ${d.child.section_label ?? ""}`}
        actions={
          <>
            {d.children.length > 1 && <UrlPicker param="child" label="Child" value={d.child.id} options={d.children.map((c) => ({ value: c.id, label: c.full_name }))} />}
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/exams/report-card/${d.child.id}`}>
                <FileText aria-hidden /> Report card
              </Link>
            </Button>
          </>
        }
      />
      {published.length === 0 ? (
        <EmptyState title="No published results yet" description="Results appear here when the school publishes them." />
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Progress across examinations</CardTitle>
              <CardDescription>{d.child.first_name}&apos;s overall percentage compared with the class average</CardDescription>
            </CardHeader>
            <CardContent>
              <ComparisonBarChart
                seriesNames={[d.child.first_name, "Class average"]}
                unit="%"
                domain={[0, 100]}
                data={published.map((h) => ({ label: h.exam.name, a: h.result.percentage, b: h.classAverage }))}
              />
            </CardContent>
          </Card>
          {latest && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {latest.exam.name} — subject-wise
                </CardTitle>
                <CardDescription>
                  {latest.result.totalObtained} / {latest.result.totalMax} · {latest.result.percentage}% · Grade {latest.result.grade?.grade ?? "—"} ·{" "}
                  <StatusBadge status={latest.result.status} />
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ComparisonBarChart
                  seriesNames={[d.child.first_name, "Class average"]}
                  data={latest.subjects.map((s) => {
                    const r = latest.result.subjects.find((x) => x.subjectId === s.subject_id);
                    const avg = latest.subjectAverages.get(s.subject_id);
                    return { label: s.code, a: r?.percent ?? null, b: avg === null || avg === undefined ? null : Math.round((avg / s.max_marks) * 1000) / 10 };
                  })}
                  unit="%"
                  domain={[0, 100]}
                />
                <ul className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
                  {latest.subjects.map((s) => {
                    const r = latest.result.subjects.find((x) => x.subjectId === s.subject_id)!;
                    return (
                      <li key={s.id} className="flex justify-between rounded-md border px-3 py-1.5">
                        <span>{s.name}</span>
                        <span className="tabular">{r.isAbsent ? "AB" : `${r.marksObtained ?? "—"} / ${s.max_marks}`}</span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
