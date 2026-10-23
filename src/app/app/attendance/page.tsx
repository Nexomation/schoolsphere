import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck2, FileBarChart, PenLine } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { MonthCalendar, type CalendarMark } from "@/components/month-calendar";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UrlPicker } from "@/components/url-controls";
import { UrlDateInput } from "@/components/url-date-input";
import { requirePageContext, type SchoolContext } from "@/lib/auth/context";
import { daySummaryBySection, studentAttendance } from "@/lib/data/attendance";
import { currentYear, familyChildren, pickChild, schoolToday, teachingSections } from "@/lib/data/school";
import { eachDate, formatDate, monthRange } from "@/lib/domain/dates";
import type { SearchParams } from "@/components/data-table";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: PageProps<"/app/attendance">) {
  const ctx = await requirePageContext("attendance.view");
  const sp = await searchParams;
  if (ctx.role === "parent" || ctx.role === "student") return <FamilyAttendance ctx={ctx} sp={sp} />;
  return <StaffAttendance ctx={ctx} sp={sp} />;
}

async function StaffAttendance({ ctx, sp }: { ctx: SchoolContext; sp: SearchParams }) {
  const d = await ctx.db(async (sql) => {
    const today = await schoolToday(sql, ctx.schoolId);
    const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
    const year = await currentYear(sql, ctx.schoolId);
    let rows = await daySummaryBySection(sql, ctx.schoolId, year.id, date);
    let classTeacherOf: string[] = [];
    if (ctx.role === "teacher") {
      const mine = await teachingSections(sql, ctx.schoolId, ctx.userId, year.id);
      rows = rows.filter((r) => mine.some((m) => m.id === r.section_id));
      classTeacherOf = mine.filter((m) => m.isClassTeacher).map((m) => m.id);
    }
    return { today, date, rows, classTeacherOf };
  });
  const totals = d.rows.reduce(
    (a, r) => ({ total: a.total + r.total, marked: a.marked + r.marked, attended: a.attended + r.present + r.late, absent: a.absent + r.absent, excused: a.excused + r.excused }),
    { total: 0, marked: 0, attended: 0, absent: 0, excused: 0 },
  );
  const unmarked = d.rows.filter((r) => r.marked === 0).length;
  const rate = totals.marked - totals.excused > 0 ? Math.round((totals.attended / (totals.marked - totals.excused)) * 1000) / 10 : null;

  return (
    <>
      <PageHeader
        title="Attendance"
        description={ctx.role === "teacher" ? "Your sections. Class teachers record daily attendance; subject teachers can record period attendance." : "Daily attendance across the school."}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/attendance/report">
                <FileBarChart aria-hidden /> Monthly report
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/app/attendance/mark?date=${d.date}`}>
                <PenLine aria-hidden /> Mark attendance
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <UrlDateInput param="date" value={d.date} label="Date" max={d.today} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Attendance rate" value={rate === null ? "—" : `${rate}%`} hint="present + late, excused excluded" icon={CalendarCheck2} tone="success" />
        <StatCard label="Students marked" value={`${totals.marked} / ${totals.total}`} />
        <StatCard label="Absent" value={totals.absent} tone={totals.absent ? "danger" : "default"} />
        <StatCard label="Sections not marked" value={unmarked} tone={unmarked ? "warning" : "success"} />
      </div>
      <DataTable
        rows={d.rows}
        rowKey={(r) => r.section_id}
        searchParams={sp}
        pageSize={50}
        empty={{ title: "No sections", description: "You are not assigned to any section yet." }}
        columns={[
          { key: "section", header: "Section", cell: (r) => <span className="font-medium">{r.label}</span> },
          {
            key: "status",
            header: "Status",
            cell: (r) => (r.marked === 0 ? <StatusBadge status="pending" label="Not marked" /> : r.marked < r.total ? <StatusBadge status="partial" label="Partly marked" /> : <StatusBadge status="completed" label="Marked" tone="success" />),
          },
          { key: "present", header: "Present", cell: (r) => r.present, align: "right" },
          { key: "late", header: "Late", cell: (r) => r.late, align: "right", hideBelow: "sm" },
          { key: "absent", header: "Absent", cell: (r) => (r.absent ? <span className="text-destructive">{r.absent}</span> : 0), align: "right" },
          { key: "total", header: "Strength", cell: (r) => r.total, align: "right", hideBelow: "md" },
          {
            key: "action",
            header: "",
            align: "right",
            cell: (r) => (
              <Button asChild size="sm" variant={r.marked ? "ghost" : "outline"}>
                <Link href={`/app/attendance/mark?section=${r.section_id}&date=${d.date}`}>{r.marked ? "View / edit" : "Mark"}</Link>
              </Button>
            ),
          },
        ]}
      />
    </>
  );
}

const STATUS_TONE: Record<string, CalendarMark["tone"]> = { present: "success", late: "warning", absent: "danger", excused: "info" };

async function FamilyAttendance({ ctx, sp }: { ctx: SchoolContext; sp: SearchParams }) {
  const d = await ctx.db(async (sql) => {
    const today = await schoolToday(sql, ctx.schoolId);
    const children = await familyChildren(sql, ctx.schoolId);
    const child = pickChild(children, sp.child);
    const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
    const { from, to } = monthRange(month);
    if (!child) return { today, children, child: null, month };
    const data = await studentAttendance(sql, ctx.schoolId, child.id, from, to > today ? today : to);
    return { today, children, child, month, ...data };
  });

  if (!d.child) {
    return (
      <>
        <PageHeader title="Attendance" />
        <EmptyState title="No linked children" description="Your account is not yet linked to a student, or the link is awaiting verification by the school office." />
      </>
    );
  }
  const marks = new Map<string, CalendarMark[]>();
  for (const r of d.records ?? []) marks.set(r.date, [{ date: r.date, label: r.status[0].toUpperCase() + r.status.slice(1), tone: STATUS_TONE[r.status] }]);
  for (const h of d.holidays ?? []) for (const day of eachDate(h.start, h.end)) if (!marks.has(day)) marks.set(day, [{ date: day, label: "Holiday", tone: "muted" }]);
  const s = d.summary!;
  const todayRecord = d.records?.find((r) => r.date === d.today);
  const childParam = d.children.length > 1 ? `&child=${d.child.id}` : "";

  return (
    <>
      <PageHeader
        title="Attendance"
        description={`${d.child.full_name} · ${d.child.section_label ?? ""}`}
        actions={
          d.children.length > 1 && (
            <UrlPicker param="child" label="Child" value={d.child.id} options={d.children.map((c) => ({ value: c.id, label: c.full_name }))} />
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Today" value={todayRecord ? todayRecord.status[0].toUpperCase() + todayRecord.status.slice(1) : "Not marked yet"} tone={todayRecord?.status === "absent" ? "danger" : todayRecord ? "success" : "default"} />
        <StatCard label="Working days" value={s.workingDays} hint={`${s.notRecordedDays} not yet recorded`} />
        <StatCard label="Days attended" value={s.attended} hint={`${s.late} late`} tone="success" />
        <StatCard label="Days missed" value={s.absent} hint={s.excused ? `${s.excused} excused (not counted)` : undefined} tone={s.absent ? "danger" : "default"} />
        <StatCard label="Attendance" value={s.percentage === null ? "—" : `${s.percentage}%`} tone={s.percentage !== null && s.percentage < d.policy!.lowAttendanceThreshold ? "warning" : "success"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="pt-6">
            <MonthCalendar month={d.month} today={d.today} marks={marks} hrefFor={(m) => `?month=${m}${childParam}`} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>How this is calculated</CardTitle>
            <CardDescription>School attendance policy</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-muted-foreground">
            <p>Only school working days count. Sundays, holidays and other non-working days are never treated as absences.</p>
            <p>Late arrivals {d.policy!.lateCountsAsPresent ? "count as attended" : "do not count as attended"}. Excused absences {d.policy!.excusedHandling === "exclude" ? "are left out of the calculation" : "count as attended"}.</p>
            <p>Days the class teacher has not yet recorded are shown separately and are not counted as absent.</p>
            <p className="pt-2">
              Showing {formatDate(monthRange(d.month).from)} to {formatDate(monthRange(d.month).to)}.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
