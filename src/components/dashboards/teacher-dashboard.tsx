import Link from "next/link";
import { ClipboardCheck, FileText, Megaphone, NotebookPen } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SchoolContext } from "@/lib/auth/context";
import { timetableForStaff } from "@/lib/data/academics";
import { listAnnouncements } from "@/lib/data/announcements";
import { listAssignmentsForStaff } from "@/lib/data/homework";
import { listExams } from "@/lib/data/exams";
import { currentYear, myStaffId, schoolToday, teachingSections } from "@/lib/data/school";
import { formatClockTime, formatDateTime, isoWeekday } from "@/lib/domain/dates";

export async function TeacherDashboard({ ctx }: { ctx: SchoolContext }) {
  const d = await ctx.db(async (sql) => {
    const year = await currentYear(sql, ctx.schoolId);
    const today = await schoolToday(sql, ctx.schoolId);
    const sections = await teachingSections(sql, ctx.schoolId, ctx.userId, year.id);
    const marked = await sql.many<{ section_id: string; n: number }>(
      "select section_id, count(*)::int as n from attendance_records where attendance_date = $1 and subject_id is null group by section_id",
      [today],
    );
    const staffId = await myStaffId(sql, ctx.schoolId, ctx.userId);
    return {
      today,
      sections,
      marked: new Map(marked.map((m) => [m.section_id, m.n])),
      assignments: await listAssignmentsForStaff(sql, ctx.schoolId, year.id),
      exams: (await listExams(sql, ctx.schoolId, year.id)).filter((e) => e.status === "marks_entry" || e.status === "scheduled"),
      periods: staffId ? (await timetableForStaff(sql, staffId)).filter((p) => p.day_of_week === isoWeekday(today)) : [],
      announcements: (await listAnnouncements(sql, ctx.schoolId)).filter((a) => a.status === "published").slice(0, 3),
    };
  });
  const classTeacherOf = d.sections.filter((s) => s.isClassTeacher);
  const toReview = d.assignments.reduce((s, a) => s + (a.submitted - a.graded), 0);
  const upcoming = d.assignments.filter((a) => new Date(a.due_at) > new Date()).slice(0, 4);

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="My sections" value={d.sections.length} hint={classTeacherOf.length ? `Class teacher: ${classTeacherOf.map((s) => s.label).join(", ")}` : "Subject teacher"} />
        <StatCard
          label="Attendance to mark today"
          value={classTeacherOf.filter((s) => !d.marked.get(s.id)).length}
          icon={ClipboardCheck}
          tone={classTeacherOf.some((s) => !d.marked.get(s.id)) ? "warning" : "success"}
          href="/app/attendance"
        />
        <StatCard label="Submissions to review" value={toReview} icon={NotebookPen} tone={toReview ? "warning" : "default"} href="/app/homework" />
        <StatCard label="Exams open for marks" value={d.exams.length} icon={FileText} href="/app/exams" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s periods</CardTitle>
          </CardHeader>
          <CardContent>
            {d.periods.length === 0 ? (
              <p className="text-sm text-muted-foreground">No periods today.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {d.periods.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 rounded-md border px-3 py-2">
                    <span>
                      <span className="font-medium">P{p.period_no}</span> · {p.subject_name} · {p.section_label}
                    </span>
                    <span className="text-muted-foreground tabular">{formatClockTime(p.start_time)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Daily attendance</CardTitle>
            <CardDescription>Sections where you are the class teacher</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {classTeacherOf.length === 0 && <p className="text-sm text-muted-foreground">You are not a class teacher this year.</p>}
            {classTeacherOf.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">{s.label}</span>
                {d.marked.get(s.id) ? (
                  <StatusBadge status="completed" tone="success" label="Marked" />
                ) : (
                  <Button asChild size="sm">
                    <Link href={`/app/attendance/mark?section=${s.id}`}>Mark now</Link>
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Homework due soon</CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link href="/app/homework/new">New</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing due.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {upcoming.map((a) => (
                  <li key={a.id}>
                    <Link href={`/app/homework/${a.id}`} className="font-medium hover:text-primary hover:underline">
                      {a.title}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {a.section_label} · due {formatDateTime(a.due_at)} · {a.submitted}/{a.expected} submitted
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {d.exams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Marks entry</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {d.exams.map((e) => (
              <Button key={e.id} asChild variant="outline" size="sm">
                <Link href={`/app/exams/${e.id}`}>
                  {e.class_name} · {e.name} ({e.marks_entered}/{e.marks_expected})
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="size-4" aria-hidden /> Announcements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {d.announcements.map((a) => (
              <li key={a.id} className="py-2">
                <Link href="/app/announcements" className="font-medium hover:text-primary">
                  {a.title}
                </Link>
              </li>
            ))}
            {d.announcements.length === 0 && <li className="text-muted-foreground">No announcements.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
