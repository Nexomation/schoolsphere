import type { Metadata } from "next";
import Link from "next/link";
import { NotebookPen, Plus } from "lucide-react";
import { DataTable, type SearchParams } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UrlPicker } from "@/components/url-controls";
import { requirePageContext, type SchoolContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { assignmentsForStudent, homeworkState, listAssignmentsForStaff } from "@/lib/data/homework";
import { currentYear, familyChildren, pickChild } from "@/lib/data/school";
import { formatDateTime, nowMs } from "@/lib/domain/dates";

export const metadata: Metadata = { title: "Homework" };

export default async function HomeworkPage({ searchParams }: PageProps<"/app/homework">) {
  const ctx = await requirePageContext("homework.view");
  const sp = await searchParams;
  if (ctx.role === "parent" || ctx.role === "student") return <FamilyHomework ctx={ctx} sp={sp} />;
  return <StaffHomework ctx={ctx} sp={sp} />;
}

async function StaffHomework({ ctx, sp }: { ctx: SchoolContext; sp: SearchParams }) {
  const rows = await ctx.db(async (sql) => listAssignmentsForStaff(sql, ctx.schoolId, (await currentYear(sql, ctx.schoolId)).id));
  const now = nowMs();
  const due = rows.filter((r) => new Date(r.due_at).getTime() <= now && r.status !== "draft");
  const expected = due.reduce((a, r) => a + r.expected, 0);
  const submitted = due.reduce((a, r) => a + r.submitted, 0);
  const toReview = rows.reduce((a, r) => a + (r.submitted - r.graded), 0);
  const sections = [...new Map(rows.map((r) => [r.section_id, r.section_label])).entries()];
  const subjects = [...new Map(rows.map((r) => [r.subject_id, r.subject_name])).entries()];

  return (
    <>
      <PageHeader
        title="Homework & assignments"
        description="Completion is submitted work as a share of students in the section, for assignments already due."
        actions={
          can(ctx.role, "homework.manage") && (
            <Button asChild size="sm">
              <Link href="/app/homework/new">
                <Plus aria-hidden /> New assignment
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Assignments" value={rows.length} hint={`${rows.filter((r) => r.status === "draft").length} drafts`} icon={NotebookPen} />
        <StatCard label="Completion (due work)" value={expected ? `${Math.round((submitted / expected) * 100)}%` : "—"} hint={`${submitted} of ${expected} submissions`} tone="success" />
        <StatCard label="Waiting for review" value={toReview} tone={toReview ? "warning" : "default"} />
        <StatCard label="Due in next 7 days" value={rows.filter((r) => new Date(r.due_at).getTime() > now && new Date(r.due_at).getTime() < now + 7 * 86_400_000).length} />
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        searchParams={sp}
        search={{ placeholder: "Search assignments", text: (r) => `${r.title} ${r.subject_name} ${r.section_label}` }}
        filters={[
          { param: "section", label: "Section", options: sections.map(([value, label]) => ({ value, label })), match: (r, v) => r.section_id === v },
          { param: "subject", label: "Subject", options: subjects.map(([value, label]) => ({ value, label })), match: (r, v) => r.subject_id === v },
        ]}
        empty={{
          title: "No assignments yet",
          description: "Create homework for your sections; students and parents are notified automatically.",
          action: can(ctx.role, "homework.manage") ? (
            <Button asChild size="sm">
              <Link href="/app/homework/new">New assignment</Link>
            </Button>
          ) : undefined,
        }}
        columns={[
          {
            key: "title",
            header: "Assignment",
            sort: (r) => r.title,
            cell: (r) => (
              <Link href={`/app/homework/${r.id}`} className="block hover:text-primary">
                <span className="font-medium">{r.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.subject_name} · {r.section_label}
                </span>
              </Link>
            ),
          },
          { key: "due", header: "Due", sort: (r) => r.due_at, cell: (r) => <span className="text-sm whitespace-nowrap">{formatDateTime(r.due_at)}</span> },
          {
            key: "completion",
            header: "Submitted",
            sort: (r) => (r.expected ? r.submitted / r.expected : 0),
            cell: (r) => (
              <div className="w-28">
                <Progress value={r.expected ? (r.submitted / r.expected) * 100 : 0} aria-label="Completion" />
                <span className="text-xs text-muted-foreground tabular">
                  {r.submitted}/{r.expected}
                  {r.late ? ` · ${r.late} late` : ""}
                </span>
              </div>
            ),
          },
          { key: "review", header: "To review", cell: (r) => r.submitted - r.graded, align: "right", hideBelow: "md" },
          { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} />, hideBelow: "sm" },
        ]}
        defaultSort={{ key: "due", dir: "desc" }}
      />
    </>
  );
}

async function FamilyHomework({ ctx, sp }: { ctx: SchoolContext; sp: SearchParams }) {
  const d = await ctx.db(async (sql) => {
    const children = await familyChildren(sql, ctx.schoolId);
    const child = pickChild(children, sp.child);
    return { children, child, rows: child?.section_id ? await assignmentsForStudent(sql, child.id, child.section_id) : [] };
  });
  if (!d.child) return <EmptyState title="No linked children" description="Your account is not linked to a student yet." />;
  const rows = d.rows.map((r) => ({ ...r, state: homeworkState(r) }));
  const count = (s: string) => rows.filter((r) => r.state === s).length;
  const total = rows.filter((r) => r.state !== "pending").length;
  const done = count("submitted") + count("graded");

  return (
    <>
      <PageHeader
        title="Homework"
        description={`${d.child.full_name} · ${d.child.section_label ?? ""}`}
        actions={d.children.length > 1 && <UrlPicker param="child" label="Child" value={d.child.id} options={d.children.map((c) => ({ value: c.id, label: c.full_name }))} />}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Pending" value={count("pending")} tone="info" />
        <StatCard label="Overdue" value={count("overdue")} tone={count("overdue") ? "danger" : "default"} />
        <StatCard label="Submitted" value={count("submitted")} />
        <StatCard label="Graded" value={count("graded")} tone="success" />
        <StatCard label="Completion" value={total ? `${Math.round((done / total) * 100)}%` : "—"} hint="of work already due" />
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        searchParams={sp}
        filters={[
          {
            param: "state",
            label: "Status",
            options: ["pending", "overdue", "submitted", "graded"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })),
            match: (r, v) => r.state === v,
          },
        ]}
        empty={{ title: "No homework yet" }}
        columns={[
          {
            key: "title",
            header: "Assignment",
            cell: (r) => (
              <Link href={`/app/homework/${r.id}${d.children.length > 1 ? `?child=${d.child!.id}` : ""}`} className="block hover:text-primary">
                <span className="font-medium">{r.title}</span>
                <span className="block text-xs text-muted-foreground">{r.subject_name}</span>
              </Link>
            ),
          },
          { key: "due", header: "Due", sort: (r) => r.effective_due_at, cell: (r) => <span className="text-sm whitespace-nowrap">{formatDateTime(r.effective_due_at)}</span> },
          {
            key: "state",
            header: "Status",
            cell: (r) => (
              <span className="flex flex-wrap gap-1">
                <StatusBadge status={r.state} />
                {r.is_late && <StatusBadge status="late" label="Late" />}
                {r.submission_status === "returned" && <StatusBadge status="pending" label="Returned for changes" />}
              </span>
            ),
          },
          { key: "marks", header: "Marks", align: "right", cell: (r) => (r.marks_awarded !== null ? `${r.marks_awarded}/${r.max_marks}` : "—"), hideBelow: "sm" },
        ]}
      />
    </>
  );
}
