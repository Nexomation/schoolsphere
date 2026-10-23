import "server-only";
import { addDays, monthRange } from "../domain/dates";
import { summarizeAttendance } from "../domain/attendance";
import type { Sql } from "../db/types";
import { attendancePolicy, currentYear, holidays, schoolToday } from "./school";

export type DashboardAlert = { tone: "danger" | "warning" | "info"; title: string; detail: string; href: string };

export async function adminDashboard(sql: Sql, schoolId: string) {
  const today = await schoolToday(sql, schoolId);
  const year = await currentYear(sql, schoolId);
  const month = today.slice(0, 7);
  const { from: monthStart, to: monthEnd } = monthRange(month);
  const policy = await attendancePolicy(sql, schoolId);

  const counts = await sql.one<{ students: number; staff: number; teachers: number; sections: number }>(
    `select
       (select count(*)::int from students where school_id = $1 and status = 'active') as students,
       (select count(*)::int from staff where school_id = $1 and status = 'active') as staff,
       (select count(*)::int from staff where school_id = $1 and status = 'active' and staff_type = 'teaching') as teachers,
       (select count(*)::int from sections where school_id = $1 and academic_year_id = $2) as sections`,
    [schoolId, year.id],
  );

  const attendanceToday = await sql.one<{ marked_sections: number; total: number; attended: number; absent: number }>(
    `select count(distinct section_id)::int as marked_sections,
            count(*)::int as total,
            count(*) filter (where status in ('present', 'late'))::int as attended,
            count(*) filter (where status = 'absent')::int as absent
     from attendance_records where school_id = $1 and attendance_date = $2 and subject_id is null`,
    [schoolId, today],
  );

  const unmarkedSections = await sql.many<{ id: string; label: string }>(
    `select sec.id, c.name || ' ' || sec.name as label from sections sec join classes c on c.id = sec.class_id
     where sec.school_id = $1 and sec.academic_year_id = $2
       and not exists (select 1 from attendance_records a where a.section_id = sec.id and a.attendance_date = $3 and a.subject_id is null)
     order by c.grade_level, sec.name`,
    [schoolId, year.id, today],
  );

  const fees = await sql.one<{ collected_month: number; collected_today: number; outstanding_due: number; outstanding_total: number; overdue_students: number }>(
    `select
       (select coalesce(sum(amount_paise), 0) from payments where school_id = $1 and status = 'captured'
          and (paid_at at time zone 'Asia/Kolkata')::date between $2 and $3) as collected_month,
       (select coalesce(sum(amount_paise), 0) from payments where school_id = $1 and status = 'captured'
          and (paid_at at time zone 'Asia/Kolkata')::date = $4) as collected_today,
       (select coalesce(sum(balance_paise), 0) from student_fee_balances where school_id = $1 and balance_paise > 0 and due_date <= $4) as outstanding_due,
       (select coalesce(sum(balance_paise), 0) from student_fee_balances where school_id = $1 and balance_paise > 0 and academic_year_id = $5) as outstanding_total,
       (select count(distinct student_id)::int from student_fee_balances where school_id = $1 and balance_paise > 0 and due_date < $4) as overdue_students`,
    [schoolId, monthStart, monthEnd, today, year.id],
  );

  const homework = await sql.one<{ expected: number; submitted: number; assignments: number }>(
    `select count(distinct a.id)::int as assignments,
            coalesce(sum((select count(*) from enrollments e where e.section_id = a.section_id and e.status = 'active')), 0)::int as expected,
            coalesce(sum((select count(*) from assignment_submissions s where s.assignment_id = a.id)), 0)::int as submitted
     from assignments a
     where a.school_id = $1 and a.status <> 'draft' and a.due_at between ($2::date - 30)::timestamptz and ($2::date + 1)::timestamptz`,
    [schoolId, today],
  );

  const upcoming = await sql.many<{ id: string; title: string; event_type: string; start_date: string; end_date: string }>(
    `select id, title, event_type, start_date, end_date from calendar_events
     where school_id = $1 and end_date >= $2 and start_date <= $2::date + 30
     order by start_date limit 6`,
    [schoolId, today],
  );

  const transport = await sql.one<{ routes: number; active_trips: number; open_alerts: number; students: number }>(
    `select (select count(*)::int from transport_routes where school_id = $1 and status = 'active') as routes,
            (select count(*)::int from transport_trips where school_id = $1 and status = 'in_progress') as active_trips,
            (select count(*)::int from transport_alerts al join transport_trips t on t.id = al.trip_id
              where al.school_id = $1 and al.resolved_at is null and t.status = 'in_progress') as open_alerts,
            (select count(*)::int from student_transport_assignments where school_id = $1 and end_date is null) as students`,
    [schoolId],
  );

  const announcements = await sql.many<{ id: string; title: string; priority: string; published_at: string; audience: string }>(
    `select id, title, priority, published_at, audience from announcements
     where school_id = $1 and status = 'published' order by published_at desc limit 4`,
    [schoolId],
  );

  // Attendance trend: daily attendance rate for the last 14 calendar days with records.
  const trend = await sql.many<{ date: string; rate: number }>(
    `select attendance_date as date,
            round(100.0 * count(*) filter (where status in ('present', 'late')) / nullif(count(*) filter (where status <> 'excused'), 0), 1)::float8 as rate
     from attendance_records
     where school_id = $1 and subject_id is null and attendance_date between $2::date - 20 and $2
     group by attendance_date order by attendance_date`,
    [schoolId, today],
  );

  // Low attendance this month (daily attendance, school policy).
  const monthRecords = await sql.many<{ student_id: string; date: string; status: "present" | "absent" | "late" | "excused" }>(
    `select student_id, attendance_date as date, status from attendance_records
     where school_id = $1 and subject_id is null and attendance_date between $2 and $3`,
    [schoolId, monthStart, today],
  );
  const hol = await holidays(sql, schoolId, monthStart, today);
  const byStudent = new Map<string, { date: string; status: "present" | "absent" | "late" | "excused" }[]>();
  for (const r of monthRecords) byStudent.set(r.student_id, [...(byStudent.get(r.student_id) ?? []), r]);
  let lowAttendance = 0;
  for (const entries of byStudent.values()) {
    const s = summarizeAttendance(entries, { from: monthStart, to: today }, policy, hol);
    if (s.percentage !== null && s.recordedDays >= 5 && s.percentage < policy.lowAttendanceThreshold) lowAttendance++;
  }

  const pending = await sql.one<{ achievements: number; guardian_links: number; expiring_documents: number; marks_pending: number }>(
    `select
       (select count(*)::int from student_achievements where school_id = $1 and status = 'pending') as achievements,
       (select count(*)::int from student_guardians sg join guardians g on g.id = sg.guardian_id
          where sg.school_id = $1 and sg.verified_at is null and g.user_id is not null) as guardian_links,
       (select count(*)::int from vehicles where school_id = $1 and status = 'active' and
          least(coalesce(insurance_expiry, 'infinity'), coalesce(fitness_expiry, 'infinity'), coalesce(permit_expiry, 'infinity')) <= $2::date + 30) as expiring_documents,
       (select count(*)::int from examinations where school_id = $1 and status = 'marks_entry') as marks_pending`,
    [schoolId, today],
  );

  const alerts: DashboardAlert[] = [];
  if (unmarkedSections.length > 0) {
    alerts.push({
      tone: "warning",
      title: `Attendance not marked for ${unmarkedSections.length} section${unmarkedSections.length > 1 ? "s" : ""} today`,
      detail: unmarkedSections.map((s) => s.label).join(", "),
      href: "/app/attendance",
    });
  }
  if (fees.overdue_students > 0) {
    alerts.push({ tone: "danger", title: fees.overdue_students === 1 ? "1 student has overdue fees" : `${fees.overdue_students} students have overdue fees`, detail: "Send reminders or review balances.", href: "/app/fees/dues" });
  }
  if (lowAttendance > 0) {
    alerts.push({ tone: "warning", title: `${lowAttendance} students below ${policy.lowAttendanceThreshold}% attendance this month`, detail: "Consider contacting their families.", href: "/app/reports/attendance" });
  }
  if (pending.guardian_links > 0) {
    alerts.push({ tone: "info", title: `${pending.guardian_links} guardian link${pending.guardian_links > 1 ? "s" : ""} awaiting verification`, detail: "Parents cannot see their child until a link is verified.", href: "/app/students?verify=pending" });
  }
  if (pending.achievements > 0) {
    alerts.push({ tone: "info", title: `${pending.achievements} achievement${pending.achievements > 1 ? "s" : ""} awaiting verification`, detail: "Review submitted certificates.", href: "/app/activities/achievements" });
  }
  if (pending.expiring_documents > 0) {
    alerts.push({ tone: "warning", title: pending.expiring_documents > 1 ? `${pending.expiring_documents} vehicles have documents expiring within 30 days` : "1 vehicle has a document expiring within 30 days", detail: "Insurance, fitness or permit renewal due.", href: "/app/transport/vehicles" });
  }
  if (transport.open_alerts > 0) {
    alerts.push({ tone: "danger", title: `${transport.open_alerts} live transport alert${transport.open_alerts > 1 ? "s" : ""}`, detail: "Delays or route deviations on active trips.", href: "/app/transport" });
  }

  return { today, year, counts, attendanceToday, unmarkedSections, fees, homework, upcoming, transport, announcements, trend, alerts, pending };
}

export async function feeCollectionByMonth(sql: Sql, schoolId: string, today: string) {
  const start = `${addDays(today, -180).slice(0, 7)}-01`;
  return sql.many<{ month: string; collected: number }>(
    `select to_char((paid_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM') as month, sum(amount_paise)::bigint as collected
     from payments where school_id = $1 and status = 'captured' and (paid_at at time zone 'Asia/Kolkata')::date >= $2
     group by 1 order by 1`,
    [schoolId, start],
  );
}
