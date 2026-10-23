import Link from "next/link";
import { AlertTriangle, Bus, CalendarDays, ClipboardCheck, GraduationCap, IndianRupee, Info, NotebookPen, Users, Wallet } from "lucide-react";
import { SimpleBarChart, TrendLineChart } from "@/components/charts";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { SchoolContext } from "@/lib/auth/context";
import { adminDashboard, feeCollectionByMonth } from "@/lib/data/dashboard";
import { formatDate } from "@/lib/domain/dates";
import { formatINRCompact, formatINR } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

const EVENT_LABELS: Record<string, string> = { holiday: "Holiday", exam: "Exam", event: "Event", ptm: "PTM", other: "Other" };

export async function AdminDashboard({ ctx }: { ctx: SchoolContext }) {
  const { d, monthly } = await ctx.db(async (sql) => {
    const d = await adminDashboard(sql, ctx.schoolId);
    const monthly = await feeCollectionByMonth(sql, ctx.schoolId, d.today);
    return { d, monthly };
  });

  const attendanceRate = d.attendanceToday.total ? Math.round((d.attendanceToday.attended / d.attendanceToday.total) * 1000) / 10 : null;
  const hwRate = d.homework.expected ? Math.round((d.homework.submitted / d.homework.expected) * 100) : null;
  const monthName = new Date(`${d.today}T00:00:00Z`).toLocaleString("en-IN", { month: "long", timeZone: "UTC" });

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active students" value={d.counts.students.toLocaleString("en-IN")} hint={`${d.counts.sections} sections · ${d.year.name}`} icon={GraduationCap} href="/app/students" />
        <StatCard label="Teachers & staff" value={`${d.counts.teachers} / ${d.counts.staff}`} hint="teaching / all active staff" icon={Users} href="/app/staff" />
        <StatCard
          label="Attendance today"
          value={attendanceRate === null ? "Not marked" : `${attendanceRate}%`}
          hint={`${d.attendanceToday.marked_sections} of ${d.counts.sections} sections marked · ${d.attendanceToday.absent} absent`}
          icon={ClipboardCheck}
          tone={d.unmarkedSections.length ? "warning" : "success"}
          href="/app/attendance"
        />
        <StatCard
          label={`Collected in ${monthName}`}
          value={formatINRCompact(d.fees.collected_month)}
          hint={`Today: ${formatINR(d.fees.collected_today, { whole: true })}`}
          icon={IndianRupee}
          tone="success"
          href="/app/fees/payments"
        />
        <StatCard
          label="Pending fee balances"
          value={formatINRCompact(d.fees.outstanding_due)}
          hint={`${d.fees.overdue_students} students overdue · ${formatINRCompact(d.fees.outstanding_total)} for the year`}
          icon={Wallet}
          tone={d.fees.overdue_students ? "danger" : "default"}
          href="/app/fees/dues"
        />
        <StatCard
          label="Homework completion"
          value={hwRate === null ? "—" : `${hwRate}%`}
          hint={`${d.homework.submitted} of ${d.homework.expected} submissions · last 30 days`}
          icon={NotebookPen}
          href="/app/homework"
        />
        <StatCard
          label="Transport"
          value={`${d.transport.active_trips} live trip${d.transport.active_trips === 1 ? "" : "s"}`}
          hint={`${d.transport.routes} routes · ${d.transport.students} students`}
          icon={Bus}
          tone={d.transport.open_alerts ? "danger" : "default"}
          href="/app/transport"
        />
        <StatCard
          label="Marks entry open"
          value={d.pending.marks_pending}
          hint="examinations awaiting marks"
          icon={CalendarDays}
          tone={d.pending.marks_pending ? "warning" : "default"}
          href="/app/exams"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>Generated from today&apos;s records. Each item links to where you can act.</CardDescription>
          </CardHeader>
          <CardContent>
            {d.alerts.length === 0 ? (
              <p className="rounded-lg bg-success/5 p-4 text-sm text-success">Everything is on track today.</p>
            ) : (
              <ul className="grid gap-2">
                {d.alerts.map((a) => (
                  <li key={a.title}>
                    <Link href={a.href} className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/60">
                      {a.tone === "info" ? (
                        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
                      ) : (
                        <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", a.tone === "danger" ? "text-destructive" : "text-warning")} aria-hidden />
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{a.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{a.detail}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming</CardTitle>
            <CardDescription>Next 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {d.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events scheduled.</p>
            ) : (
              <ul className="grid gap-3">
                {d.upcoming.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(e.start_date)}
                        {e.end_date !== e.start_date && ` – ${formatDate(e.end_date)}`}
                      </p>
                    </div>
                    <StatusBadge status={e.event_type} label={EVENT_LABELS[e.event_type] ?? e.event_type} tone={e.event_type === "holiday" ? "warning" : e.event_type === "exam" ? "info" : "accent"} />
                  </li>
                ))}
              </ul>
            )}
            <Link href="/app/calendar" className="mt-4 inline-block text-sm text-primary hover:underline">
              Open calendar
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily attendance rate</CardTitle>
            <CardDescription>Present or late as a share of students marked (excused excluded), last three weeks</CardDescription>
          </CardHeader>
          <CardContent>
            {d.trend.length ? (
              <TrendLineChart
                name="Attendance rate"
                unit="%"
                domain={[70, 100]}
                data={d.trend.map((t) => ({ label: formatDate(t.date).replace(/ \d{4}$/, ""), value: t.rate }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No attendance recorded yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fee collection by month</CardTitle>
            <CardDescription>Captured payments, last six months</CardDescription>
          </CardHeader>
          <CardContent>
            {monthly.length ? (
              <SimpleBarChart
                name="Collected"
                valueFormat="inr"
                data={monthly.map((m) => ({
                  label: new Date(`${m.month}-01T00:00:00Z`).toLocaleString("en-IN", { month: "short", timeZone: "UTC" }),
                  value: Math.round(m.collected / 100),
                }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Recent announcements</CardTitle>
          </div>
          <Link href="/app/announcements" className="text-sm text-primary hover:underline">
            All announcements
          </Link>
        </CardHeader>
        <CardContent>
          {d.announcements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing published yet.</p>
          ) : (
            <ul className="divide-y">
              {d.announcements.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-sm">{a.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {a.priority !== "normal" && <StatusBadge status={a.priority} tone={a.priority === "urgent" ? "danger" : "warning"} />}
                    <span className="text-xs text-muted-foreground">{formatDate(a.published_at.slice(0, 10))}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {d.homework.expected > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Homework completion (school)</CardTitle>
            <CardDescription>{d.homework.assignments} assignments due in the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={hwRate ?? 0} aria-label="Homework completion" />
            <p className="mt-2 text-xs text-muted-foreground">
              {d.homework.submitted} submitted of {d.homework.expected} expected. See class-level figures in Homework.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
