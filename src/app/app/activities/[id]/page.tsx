import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserMinus } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { listStaff } from "@/lib/data/academics";
import { activityMembers, listActivities } from "@/lib/data/activities";
import { currentYear, schoolToday } from "@/lib/data/school";
import { CATEGORY_LABELS } from "@/lib/schemas/activities";
import { withdrawAction } from "../actions";
import { ActivityDialog, SessionAttendance } from "../forms";
import { EnrollPicker } from "./enroll-picker";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ params }: PageProps<"/app/activities/[id]">) {
  const ctx = await requirePageContext("activities.manage");
  const { id } = await params;
  const d = await ctx.db(async (sql) => {
    const year = await currentYear(sql, ctx.schoolId);
    const activity = (await listActivities(sql, ctx.schoolId, year.id, ctx.userId)).find((a) => a.id === id);
    if (!activity) return null;
    return {
      activity,
      today: await schoolToday(sql, ctx.schoolId),
      members: await activityMembers(sql, id),
      staff: (await listStaff(sql, ctx.schoolId)).filter((s) => s.status === "active"),
      // Teachers only see students they teach (RLS); admins see everyone.
      students: await sql.many<{ id: string; name: string; section_label: string | null }>(
        `select s.id, trim(s.first_name || ' ' || s.last_name) as name, c.name || ' ' || sec.name as section_label
         from students s left join enrollments e on e.student_id = s.id and e.status = 'active'
         left join sections sec on sec.id = e.section_id left join classes c on c.id = sec.class_id
         where s.school_id = $1 and s.status = 'active' order by c.grade_level, s.first_name`,
        [ctx.schoolId],
      ),
    };
  });
  if (!d) notFound();
  const canEdit = ctx.role === "school_admin" || d.activity.i_coordinate;
  const registered = d.members.filter((m) => m.status === "registered");
  const inActivity = new Set(registered.map((m) => m.student_id));

  return (
    <>
      <PageHeader
        title={d.activity.name}
        description={`${CATEGORY_LABELS[d.activity.category]} · ${registered.length} registered${d.activity.coordinator ? ` · Coordinator: ${d.activity.coordinator}` : ""}`}
        back={{ href: "/app/activities", label: "Activities" }}
        actions={canEdit && <ActivityDialog activity={d.activity} staff={d.staff.map((s) => ({ value: s.id, label: s.full_name }))} canAssignCoordinator={ctx.role === "school_admin"} />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Participants</CardTitle>
            <CardDescription>Attendance is shown as sessions present / sessions recorded.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {canEdit && <EnrollPicker activityId={d.activity.id} students={d.students.filter((s) => !inActivity.has(s.id)).map((s) => ({ value: s.id, label: `${s.name}${s.section_label ? ` (${s.section_label})` : ""}` }))} />}
            <ul className="divide-y text-sm">
              {d.members.map((m) => (
                <li key={m.enrollment_id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <Link href={`/app/activities/portfolio/${m.student_id}`} className="font-medium hover:text-primary hover:underline">
                      {m.name}
                    </Link>{" "}
                    <span className="text-muted-foreground">{m.section_label}</span>
                    {m.status !== "registered" && <StatusBadge status={m.status} className="ml-2" />}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular">
                      {m.present}/{m.sessions}
                    </span>
                    {canEdit && m.status === "registered" && (
                      <ConfirmAction
                        action={withdrawAction.bind(null, d.activity.id, m.student_id)}
                        title={`Remove ${m.name}?`}
                        description="Their past attendance stays on record."
                        confirmLabel="Remove"
                        variant="destructive"
                        trigger={
                          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${m.name}`}>
                            <UserMinus />
                          </Button>
                        }
                      />
                    )}
                  </span>
                </li>
              ))}
              {d.members.length === 0 && <li className="py-3 text-muted-foreground">No one has registered yet.</li>}
            </ul>
          </CardContent>
        </Card>
        {canEdit && (
          <Card>
            <CardHeader>
              <CardTitle>Session attendance</CardTitle>
            </CardHeader>
            <CardContent>
              <SessionAttendance activityId={d.activity.id} members={registered.map((m) => ({ student_id: m.student_id, name: m.name }))} today={d.today} />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
