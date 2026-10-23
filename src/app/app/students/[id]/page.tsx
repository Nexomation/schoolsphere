import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, humanize } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { studentAttendance } from "@/lib/data/attendance";
import { schoolToday } from "@/lib/data/school";
import { getStudent, studentEnrollments, studentGuardians } from "@/lib/data/students";
import { NotFoundError } from "@/lib/errors";
import { formatDate, monthRange } from "@/lib/domain/dates";
import { formatINR } from "@/lib/domain/money";
import { removeGuardianLinkAction, setGuardianVerifiedAction } from "../actions";
import { AddGuardianDialog, InviteDialog, StatusChangeDialog } from "./student-actions";

export const metadata: Metadata = { title: "Student profile" };

export default async function StudentPage({ params }: PageProps<"/app/students/[id]">) {
  const ctx = await requirePageContext("students.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const data = await ctx.db(async (sql) => {
    try {
      const student = await getStudent(sql, id);
      const today = await schoolToday(sql, ctx.schoolId);
      const { from } = monthRange(today.slice(0, 7));
      return {
        student,
        today,
        enrollments: await studentEnrollments(sql, id),
        guardians: await studentGuardians(sql, id),
        attendance: (await studentAttendance(sql, ctx.schoolId, id, from, today)).summary,
        fees: await sql.one<{ net: number; paid: number; balance: number; overdue: number }>(
          `select coalesce(sum(net_paise), 0) as net, coalesce(sum(paid_paise), 0) as paid, coalesce(sum(balance_paise), 0) as balance,
                  coalesce(sum(balance_paise) filter (where due_date < $2), 0) as overdue
           from student_fee_balances where student_id = $1`,
          [id, today],
        ),
        transport: await sql.maybeOne<{ route: string; stop: string }>(
          `select r.name as route, rs.name as stop from student_transport_assignments t
           join transport_routes r on r.id = t.route_id join route_stops rs on rs.id = t.stop_id
           where t.student_id = $1 and t.end_date is null`,
          [id],
        ),
      };
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
  });
  if (!data) notFound();

  const { student: s, guardians, enrollments, attendance, fees, transport, today } = data;
  const manage = can(ctx.role, "students.manage");
  const current = enrollments.find((e) => e.status === "active");
  const showFees = can(ctx.role, "fees.view");

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {s.full_name} <StatusBadge status={s.status} />
          </span>
        }
        description={`${current?.section_label ?? "Not enrolled this year"} · Admission no ${s.admission_no}${current?.roll_no ? ` · Roll ${current.roll_no}` : ""}`}
        back={{ href: "/app/students", label: "Students" }}
        actions={
          manage && (
            <>
              <StatusChangeDialog studentId={s.id} currentStatus={s.status} today={today} />
              <Button asChild size="sm" variant="outline">
                <Link href={`/app/students/${s.id}/edit`}>
                  <Pencil aria-hidden /> Edit
                </Link>
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="gap-1 py-4">
          <CardContent className="px-4">
            <p className="text-sm text-muted-foreground">Attendance this month</p>
            <p className="tabular text-2xl font-semibold">{attendance.percentage === null ? "—" : `${attendance.percentage}%`}</p>
            <p className="text-xs text-muted-foreground">
              {attendance.attended} of {attendance.countedDays} recorded days · {attendance.absent} absent
            </p>
          </CardContent>
        </Card>
        {showFees && (
          <Card className="gap-1 py-4">
            <CardContent className="px-4">
              <p className="text-sm text-muted-foreground">Fee balance</p>
              <p className="tabular text-2xl font-semibold">{formatINR(fees.balance, { whole: true })}</p>
              <p className="text-xs text-muted-foreground">
                {fees.overdue > 0 ? <span className="text-destructive">{formatINR(fees.overdue, { whole: true })} overdue</span> : "Nothing overdue"} ·{" "}
                <Link className="text-primary hover:underline" href={`/app/fees/students/${s.id}`}>
                  Ledger
                </Link>
              </p>
            </CardContent>
          </Card>
        )}
        <Card className="gap-1 py-4">
          <CardContent className="px-4">
            <p className="text-sm text-muted-foreground">Transport</p>
            <p className="truncate text-lg font-semibold">{transport ? transport.route : "Not using transport"}</p>
            <p className="text-xs text-muted-foreground">{transport ? `Stop: ${transport.stop}` : "Assign a route in Transport"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Guardians</CardTitle>
              <CardDescription>Only verified links let a parent see this child in the app.</CardDescription>
            </div>
            {manage && <AddGuardianDialog studentId={s.id} />}
          </CardHeader>
          <CardContent>
            {guardians.length === 0 ? (
              <p className="text-sm text-muted-foreground">No guardian linked.</p>
            ) : (
              <ul className="divide-y">
                {guardians.map((g) => (
                  <li key={g.link_id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {g.full_name}
                        <span className="text-xs font-normal text-muted-foreground">{humanize(g.relationship)}</span>
                        {g.is_primary && <StatusBadge status="primary" label="Primary" tone="accent" />}
                        {g.verified_at ? (
                          <span className="inline-flex items-center gap-1 text-xs text-success">
                            <BadgeCheck className="size-3.5" aria-hidden /> Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-warning">
                            <ShieldAlert className="size-3.5" aria-hidden /> Not verified
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground tabular">
                        {g.phone}
                        {g.email && ` · ${g.email}`}
                        {g.has_account ? " · Has app account" : ""}
                      </p>
                    </div>
                    {manage && (
                      <div className="flex flex-wrap gap-2">
                        {!g.has_account && (
                          <InviteDialog role="parent" defaults={{ email: g.email ?? "", fullName: g.full_name }} link={{ guardianId: g.guardian_id }} />
                        )}
                        <ConfirmAction
                          action={setGuardianVerifiedAction.bind(null, s.id, g.link_id, !g.verified_at)}
                          title={g.verified_at ? "Remove verification?" : "Verify this guardian?"}
                          description={
                            g.verified_at
                              ? `${g.full_name} will no longer see ${s.first_name}'s records in the app.`
                              : `Confirm you have checked ${g.full_name}'s identity against the admission records. They will be able to see ${s.first_name}'s attendance, marks, fees and transport.`
                          }
                          confirmLabel={g.verified_at ? "Remove verification" : "Verify"}
                        />
                        <ConfirmAction
                          action={removeGuardianLinkAction.bind(null, s.id, g.link_id)}
                          title="Unlink guardian?"
                          description={`${g.full_name} will be removed from ${s.first_name}'s record. The guardian record itself is kept for siblings.`}
                          confirmLabel="Unlink"
                          variant="destructive"
                          trigger={
                            <Button size="icon-sm" variant="ghost" aria-label={`Unlink ${g.full_name}`}>
                              <Trash2 />
                            </Button>
                          }
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm">
              {[
                ["Date of birth", formatDate(s.date_of_birth)],
                ["Gender", humanize(s.gender)],
                ["Blood group", s.blood_group ?? "—"],
                ["Admitted on", formatDate(s.admission_date)],
                ["EMIS no", s.emis_no ?? "—"],
                ["Address", s.address ?? "—"],
                ["Student login", s.user_id ? "Active" : "Not invited"],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 break-words">{v}</dd>
                </div>
              ))}
              {s.medical_notes && (
                <div className="mt-2 rounded-lg bg-warning/10 p-2 text-xs text-warning">
                  <strong>Medical:</strong> {s.medical_notes}
                </div>
              )}
            </dl>
            {manage && !s.user_id && (
              <div className="mt-4">
                <InviteDialog role="student" defaults={{ email: "", fullName: s.full_name }} link={{ studentId: s.id }} triggerLabel="Invite student" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Enrollment history</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {enrollments.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{e.year}</span> · {e.section_label}
                  {e.roll_no ? ` · Roll ${e.roll_no}` : ""}
                </span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {formatDate(e.enrolled_on)}
                  {e.left_on && ` – ${formatDate(e.left_on)}`}
                  <StatusBadge status={e.status} />
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/exams/report-card/${s.id}`}>Report card</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/activities/portfolio/${s.id}`}>Development portfolio</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
