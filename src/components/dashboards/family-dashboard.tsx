import Link from "next/link";
import { Bus, CalendarCheck2, FileText, NotebookPen, Trophy, Wallet } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UrlPicker } from "@/components/url-controls";
import type { SchoolContext } from "@/lib/auth/context";
import { studentAttendance } from "@/lib/data/attendance";
import { timetableForSection, listEvents } from "@/lib/data/academics";
import { assignmentsForStudent, homeworkState } from "@/lib/data/homework";
import { studentExamHistory } from "@/lib/data/exams";
import { currentYear, familyChildren, pickChild, schoolProfile, schoolToday } from "@/lib/data/school";
import { addDays, formatClockTime, formatDate, formatDateTime, isoWeekday, monthRange } from "@/lib/domain/dates";
import type { AbsentPolicy } from "@/lib/domain/grading";
import { formatINR } from "@/lib/domain/money";

/** Parent (with child selector) and student dashboard. All data is read with the family's RLS scope. */
export async function FamilyDashboard({ ctx, searchParams }: { ctx: SchoolContext; searchParams?: Record<string, string | string[] | undefined> }) {
  const parent = ctx.role === "parent";
  const d = await ctx.db(async (sql) => {
    const children = await familyChildren(sql, ctx.schoolId);
    const child = pickChild(children, searchParams?.child);
    if (!child) return { children, child: null };
    const today = await schoolToday(sql, ctx.schoolId);
    const year = await currentYear(sql, ctx.schoolId);
    const school = await schoolProfile(sql, ctx.schoolId);
    const att = await studentAttendance(sql, ctx.schoolId, child.id, monthRange(today.slice(0, 7)).from, today);
    const homework = child.section_id ? (await assignmentsForStudent(sql, child.id, child.section_id)).map((h) => ({ ...h, state: homeworkState(h) })) : [];
    const results = (await studentExamHistory(sql, child.id, year.id, (school.settings.absentPolicy as AbsentPolicy) ?? "absent_counts_as_zero")).filter((h) => h.exam.status === "published");
    const fees = parent
      ? await sql.one<{ balance: number; overdue: number; next_due: string | null }>(
          `select coalesce(sum(balance_paise), 0) as balance, coalesce(sum(balance_paise) filter (where due_date < $2), 0) as overdue,
                  min(due_date) filter (where balance_paise > 0 and due_date >= $2) as next_due
           from student_fee_balances where student_id = $1`,
          [child.id, today],
        )
      : null;
    const transport = await sql.maybeOne<{ route: string; stop: string; trip_id: string | null }>(
      `select r.code || ' · ' || r.name as route, s.name as stop,
              (select t.id from transport_trips t where t.route_id = r.id and t.status = 'in_progress' limit 1) as trip_id
       from student_transport_assignments a join transport_routes r on r.id = a.route_id join route_stops s on s.id = a.stop_id
       where a.student_id = $1 and a.end_date is null`,
      [child.id],
    );
    const achievements = await sql.many<{ title: string; achieved_on: string; status: string }>(
      "select title, achieved_on, status from student_achievements where student_id = $1 order by achieved_on desc limit 3",
      [child.id],
    );
    return {
      children,
      child,
      today,
      todayStatus: att.records.find((r) => r.date === today)?.status ?? null,
      att: att.summary,
      homework,
      results,
      fees,
      transport,
      achievements,
      events: await listEvents(sql, ctx.schoolId, today, addDays(today, 30)),
      periods: child.section_id ? (await timetableForSection(sql, child.section_id)).filter((p) => p.day_of_week === isoWeekday(today)) : [],
    };
  });

  if (!d.child) {
    return (
      <EmptyState
        title={parent ? "Waiting for the school to link your child" : "Your account is not linked to a student record"}
        description={parent ? "Your account exists, but the school office has not verified the link to your child yet. Please contact the office with your child's admission number." : "Please contact the school office."}
      />
    );
  }
  const child = d.child;
  const q = d.children.length > 1 ? `?child=${child.id}` : "";
  const pending = d.homework.filter((h) => h.state === "pending" || h.state === "overdue");
  const latest = d.results!.at(-1);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{child.full_name}</p>
          <p className="text-sm text-muted-foreground">
            {child.section_label} · Roll {child.roll_no ?? "—"} · {child.admission_no}
          </p>
        </div>
        {d.children.length > 1 && <UrlPicker param="child" label="Child" value={child.id} options={d.children.map((c) => ({ value: c.id, label: c.full_name }))} />}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Today"
          value={d.todayStatus ? d.todayStatus[0].toUpperCase() + d.todayStatus.slice(1) : "Not marked yet"}
          hint={`This month: ${d.att!.percentage === null ? "—" : `${d.att!.percentage}%`}`}
          icon={CalendarCheck2}
          tone={d.todayStatus === "absent" ? "danger" : d.todayStatus ? "success" : "default"}
          href={`/app/attendance${q}`}
        />
        <StatCard label="Homework pending" value={pending.length} hint={`${d.homework.filter((h) => h.state === "overdue").length} overdue`} icon={NotebookPen} tone={pending.some((h) => h.state === "overdue") ? "danger" : "default"} href={`/app/homework${q}`} />
        <StatCard
          label="Latest result"
          value={latest ? `${latest.result.percentage}%` : "—"}
          hint={latest ? `${latest.exam.name} · Grade ${latest.result.grade?.grade ?? "—"}` : "No published results"}
          icon={FileText}
          href={`/app/exams${q}`}
        />
        {d.fees ? (
          <StatCard
            label="Fees due"
            value={formatINR(d.fees.balance, { whole: true })}
            hint={d.fees.overdue ? `${formatINR(d.fees.overdue, { whole: true })} overdue` : d.fees.next_due ? `Next due ${formatDate(d.fees.next_due)}` : "Nothing overdue"}
            icon={Wallet}
            tone={d.fees.overdue ? "danger" : "success"}
            href={`/app/fees${q}`}
          />
        ) : (
          <StatCard label="Achievements" value={d.achievements!.filter((a) => a.status === "verified").length} icon={Trophy} href="/app/activities/achievements" />
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Homework</CardTitle>
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">All caught up.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {pending.slice(0, 5).map((h) => (
                  <li key={h.id} className="flex items-start justify-between gap-2">
                    <Link href={`/app/homework/${h.id}${q}`} className="min-w-0 hover:text-primary">
                      <span className="block truncate font-medium">{h.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {h.subject_name} · due {formatDateTime(h.effective_due_at)}
                      </span>
                    </Link>
                    <StatusBadge status={h.state} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{ctx.role === "student" ? "Today's timetable" : "Transport"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {ctx.role === "student" ? (
              d.periods!.length === 0 ? (
                <p className="text-muted-foreground">No classes today.</p>
              ) : (
                <ul className="grid gap-1.5">
                  {d.periods!.map((p) => (
                    <li key={p.id} className="flex justify-between">
                      <span>
                        P{p.period_no} · {p.subject_name}
                      </span>
                      <span className="text-muted-foreground tabular">{formatClockTime(p.start_time)}</span>
                    </li>
                  ))}
                </ul>
              )
            ) : d.transport ? (
              <div className="grid gap-2">
                <p className="flex items-center gap-2">
                  <Bus className="size-4 text-muted-foreground" aria-hidden /> {d.transport.route}
                </p>
                <p className="text-muted-foreground">Stop: {d.transport.stop}</p>
                {d.transport.trip_id ? (
                  <Link href={`/app/transport${q}`} className="font-medium text-primary hover:underline">
                    Van is on the way — track live
                  </Link>
                ) : (
                  <p className="text-muted-foreground">No trip running now.</p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Not using school transport.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Coming up</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {d.events!.slice(0, 5).map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span>{e.title}</span>
                  <span className="shrink-0 text-muted-foreground">{formatDate(e.start_date)}</span>
                </li>
              ))}
              {d.events!.length === 0 && <li className="text-muted-foreground">Nothing scheduled.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
      {d.achievements!.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-4" aria-hidden /> Recent achievements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {d.achievements!.map((a, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{a.title}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {formatDate(a.achieved_on)} {a.status !== "verified" && <StatusBadge status={a.status} />}
                  </span>
                </li>
              ))}
            </ul>
            <Link href={`/app/activities/portfolio/${child.id}`} className="mt-3 inline-block text-sm text-primary hover:underline">
              Development report
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
