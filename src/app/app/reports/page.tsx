import type { Metadata } from "next";
import Link from "next/link";
import { Bus, ClipboardCheck, Download, FileText, IndianRupee, Users } from "lucide-react";
import { SimpleBarChart } from "@/components/charts";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePageContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { currentYear, schoolToday } from "@/lib/data/school";
import { monthRange } from "@/lib/domain/dates";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await requirePageContext("reports.view");
  const admin = ctx.role === "school_admin";
  const d = await ctx.db(async (sql) => {
    const year = await currentYear(sql, ctx.schoolId);
    const today = await schoolToday(sql, ctx.schoolId);
    const { from } = monthRange(today.slice(0, 7));
    return {
      today,
      month: today.slice(0, 7),
      enrollment: await sql.many<{ label: string; boys: number; girls: number; other: number; total: number }>(
        `select c.name as label, count(*) filter (where s.gender = 'male')::int as boys, count(*) filter (where s.gender = 'female')::int as girls,
                count(*) filter (where s.gender = 'other')::int as other, count(*)::int as total
         from enrollments e join students s on s.id = e.student_id join sections sec on sec.id = e.section_id join classes c on c.id = sec.class_id
         where e.academic_year_id = $1 and e.status = 'active' group by c.name, c.grade_level order by c.grade_level`,
        [year.id],
      ),
      attendance: admin
        ? await sql.many<{ label: string; rate: number | null }>(
            `select c.name || ' ' || sec.name as label,
                    round(100.0 * count(*) filter (where a.status in ('present', 'late')) / nullif(count(*) filter (where a.status <> 'excused'), 0), 1)::float8 as rate
             from attendance_records a join sections sec on sec.id = a.section_id join classes c on c.id = sec.class_id
             where a.school_id = $1 and a.subject_id is null and a.attendance_date between $2 and $3
             group by c.name, sec.name, c.grade_level order by c.grade_level, sec.name`,
            [ctx.schoolId, from, today],
          )
        : [],
    };
  });
  const links = [
    { icon: ClipboardCheck, title: "Attendance by section", text: "Monthly per-student percentages with CSV export.", href: "/app/attendance/report", show: admin },
    { icon: IndianRupee, title: "Fee collection & reconciliation", text: "Daily collection, methods, categories, class balances, online orders.", href: "/app/fees/reports", show: can(ctx.role, "fees.manage") },
    { icon: IndianRupee, title: "Dues", text: "Overdue balances by student with guardian phone numbers.", href: "/app/fees/dues", show: can(ctx.role, "fees.manage") },
    { icon: FileText, title: "Examination results", text: "Subject statistics and results per examination.", href: "/app/exams", show: admin },
    { icon: Bus, title: "Transport", text: "Trips, delays, deviations and boardings per route.", href: "/app/transport/reports", show: admin },
  ].filter((l) => l.show);

  return (
    <>
      <PageHeader title="Reports" description="Every figure is calculated live from school records." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <Link key={l.title} href={l.href} className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardHeader className="flex-row items-start gap-3">
                <l.icon className="mt-0.5 size-5 text-primary" aria-hidden />
                <div>
                  <CardTitle className="text-base">{l.title}</CardTitle>
                  <CardDescription>{l.text}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" aria-hidden /> Enrollment by class
            </CardTitle>
            <CardDescription>Active students in the current academic year.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {admin && (
              <Button asChild size="sm" variant="outline">
                <a href="/api/export/students">
                  <Download aria-hidden /> Students CSV
                </a>
              </Button>
            )}
            {can(ctx.role, "fees.manage") && (
              <>
                <Button asChild size="sm" variant="outline">
                  <a href="/api/export/dues">
                    <Download aria-hidden /> Dues CSV
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`/api/export/payments?from=${d.month}-01&to=${d.today}`}>
                    <Download aria-hidden /> Payments CSV (this month)
                  </a>
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead className="text-right">Boys</TableHead>
                <TableHead className="text-right">Girls</TableHead>
                <TableHead className="text-right">Other</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.enrollment.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-right tabular">{r.boys}</TableCell>
                  <TableCell className="text-right tabular">{r.girls}</TableCell>
                  <TableCell className="text-right tabular">{r.other}</TableCell>
                  <TableCell className="text-right tabular font-medium">{r.total}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">All classes</TableCell>
                {(["boys", "girls", "other", "total"] as const).map((k) => (
                  <TableCell key={k} className="text-right tabular font-semibold">
                    {d.enrollment.reduce((s, r) => s + r[k], 0)}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {admin && d.attendance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Attendance rate by section this month</CardTitle>
            <CardDescription>Present or late as a share of recorded days, excused excluded.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart name="Attendance rate" valueFormat="percent" domain={[0, 100]} data={d.attendance.map((a) => ({ label: a.label.replace("Class ", ""), value: a.rate }))} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
