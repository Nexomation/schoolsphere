import type { Metadata } from "next";
import { Download } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { UrlPicker } from "@/components/url-controls";
import { UrlDateInput } from "@/components/url-date-input";
import { requirePageContext } from "@/lib/auth/context";
import { sectionMonthSummary } from "@/lib/data/attendance";
import { attendancePolicy, currentYear, schoolToday, sectionsOfYear, teachingSections } from "@/lib/data/school";

export const metadata: Metadata = { title: "Attendance report" };

export default async function AttendanceReportPage({ searchParams }: PageProps<"/app/attendance/report">) {
  const ctx = await requirePageContext("attendance.mark");
  const sp = await searchParams;
  const d = await ctx.db(async (sql) => {
    const today = await schoolToday(sql, ctx.schoolId);
    const year = await currentYear(sql, ctx.schoolId);
    const sections =
      ctx.role === "teacher"
        ? (await teachingSections(sql, ctx.schoolId, ctx.userId, year.id)).map((s) => ({ id: s.id, label: s.label }))
        : (await sectionsOfYear(sql, ctx.schoolId, year.id)).map((s) => ({ id: s.id, label: s.label }));
    const section = sections.find((s) => s.id === sp.section) ?? sections[0];
    const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
    return {
      sections,
      section,
      month,
      today,
      policy: await attendancePolicy(sql, ctx.schoolId),
      rows: section ? await sectionMonthSummary(sql, ctx.schoolId, section.id, month, today) : [],
    };
  });
  if (!d.section) return <EmptyState title="No sections available" />;
  const workingDays = d.rows[0]?.summary.workingDays ?? 0;

  return (
    <>
      <PageHeader
        title="Monthly attendance report"
        description={`${d.section.label} · ${workingDays} working days so far. Low attendance threshold: ${d.policy.lowAttendanceThreshold}%.`}
        back={{ href: "/app/attendance", label: "Attendance" }}
        actions={
          <Button asChild variant="outline" size="sm">
            <a href={`/api/export/attendance?section=${d.section.id}&month=${d.month}`}>
              <Download aria-hidden /> Export CSV
            </a>
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Section</span>
          <UrlPicker param="section" label="Section" value={d.section.id} options={d.sections.map((s) => ({ value: s.id, label: s.label }))} />
        </div>
        <UrlDateInput param="month" type="month" value={d.month} label="Month" max={d.today.slice(0, 7)} />
      </div>
      <DataTable
        rows={d.rows}
        rowKey={(r) => r.studentId}
        searchParams={sp}
        pageSize={60}
        defaultSort={{ key: "roll", dir: "asc" }}
        columns={[
          { key: "roll", header: "Roll", sort: (r) => r.rollNo, cell: (r) => r.rollNo ?? "—", align: "right" },
          { key: "name", header: "Student", sort: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "attended", header: "Attended", cell: (r) => r.summary.attended, align: "right" },
          { key: "absent", header: "Absent", sort: (r) => r.summary.absent, cell: (r) => r.summary.absent, align: "right" },
          { key: "late", header: "Late", cell: (r) => r.summary.late, align: "right", hideBelow: "sm" },
          { key: "excused", header: "Excused", cell: (r) => r.summary.excused, align: "right", hideBelow: "md" },
          { key: "unrecorded", header: "Not recorded", cell: (r) => r.summary.notRecordedDays, align: "right", hideBelow: "md" },
          {
            key: "pct",
            header: "Attendance",
            sort: (r) => r.summary.percentage,
            align: "right",
            cell: (r) =>
              r.summary.percentage === null ? (
                "—"
              ) : r.summary.percentage < d.policy.lowAttendanceThreshold ? (
                <StatusBadge status="low" tone="danger" label={`${r.summary.percentage}%`} />
              ) : (
                <span className="tabular">{r.summary.percentage}%</span>
              ),
          },
        ]}
      />
    </>
  );
}
