import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, MapPin, Users } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UrlPicker } from "@/components/url-controls";
import { requirePageContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listStaff } from "@/lib/data/academics";
import { listActivities } from "@/lib/data/activities";
import { currentYear, familyChildren, pickChild } from "@/lib/data/school";
import { CATEGORY_LABELS } from "@/lib/schemas/activities";
import { enrollAction, withdrawAction } from "./actions";
import { ActivityDialog } from "./forms";

export const metadata: Metadata = { title: "Activities" };

export default async function ActivitiesPage({ searchParams }: PageProps<"/app/activities">) {
  const ctx = await requirePageContext("activities.view");
  const sp = await searchParams;
  const family = ctx.role === "parent" || ctx.role === "student";
  const d = await ctx.db(async (sql) => {
    const year = await currentYear(sql, ctx.schoolId);
    const activities = await listActivities(sql, ctx.schoolId, year.id, ctx.userId);
    const staff = ctx.role === "school_admin" ? (await listStaff(sql, ctx.schoolId)).filter((s) => s.status === "active") : [];
    const children = family ? await familyChildren(sql, ctx.schoolId) : [];
    const child = family ? pickChild(children, sp.child) : null;
    const mine = child
      ? new Map(
          (await sql.many<{ activity_id: string; status: string }>("select activity_id, status from activity_enrollments where student_id = $1", [child.id])).map((r) => [r.activity_id, r.status]),
        )
      : new Map<string, string>();
    return { activities, staff, children, child, mine };
  });
  const admin = ctx.role === "school_admin";
  const staffOptions = d.staff.map((s) => ({ value: s.id, label: s.full_name }));

  return (
    <>
      <PageHeader
        title="Extracurricular activities"
        description={family ? `${d.child?.full_name ?? ""}: clubs, sports and events` : "Clubs, sports, arts, STEM, competitions and events for this academic year."}
        actions={
          <>
            {family && d.children.length > 1 && d.child && <UrlPicker param="child" label="Child" value={d.child.id} options={d.children.map((c) => ({ value: c.id, label: c.full_name }))} />}
            {family && d.child && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/app/activities/portfolio/${d.child.id}`}>Development report</Link>
              </Button>
            )}
            {admin && <ActivityDialog staff={staffOptions} canAssignCoordinator />}
          </>
        }
      />
      {d.activities.length === 0 ? (
        <EmptyState title="No activities this year" description={admin ? "Create clubs and events so students can join." : undefined} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {d.activities.map((a) => {
            const status = d.mine.get(a.id);
            const full = a.capacity !== null && a.enrolled >= a.capacity;
            return (
              <Card key={a.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">
                      {can(ctx.role, "activities.manage") || a.i_coordinate ? (
                        <Link href={`/app/activities/${a.id}`} className="hover:text-primary hover:underline">
                          {a.name}
                        </Link>
                      ) : (
                        a.name
                      )}
                    </CardTitle>
                    {a.status !== "active" && <StatusBadge status={a.status} />}
                  </div>
                  <CardDescription>
                    <StatusBadge status="category" tone="accent" label={CATEGORY_LABELS[a.category]} />
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid flex-1 content-start gap-1.5 text-sm text-muted-foreground">
                  {a.description && <p className="text-foreground">{a.description}</p>}
                  {a.schedule && (
                    <p className="flex items-center gap-1.5">
                      <Calendar className="size-3.5" aria-hidden /> {a.schedule}
                    </p>
                  )}
                  {a.venue && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="size-3.5" aria-hidden /> {a.venue}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5">
                    <Users className="size-3.5" aria-hidden /> {a.enrolled}
                    {a.capacity ? ` / ${a.capacity}` : ""} registered{a.coordinator ? ` · Coordinator: ${a.coordinator}` : ""}
                  </p>
                  {family && d.child && (
                    <div className="mt-3">
                      {status === "registered" ? (
                        <div className="flex items-center gap-2">
                          <StatusBadge status="active" label="Registered" />
                          {ctx.role === "parent" && (
                            <ConfirmAction action={withdrawAction.bind(null, a.id, d.child.id)} title={`Withdraw from ${a.name}?`} description="Your child will be removed from the list." confirmLabel="Withdraw" triggerVariant="ghost" />
                          )}
                        </div>
                      ) : ctx.role === "parent" && a.registration_open && a.status === "active" ? (
                        <ConfirmAction
                          action={enrollAction.bind(null, a.id, d.child.id)}
                          title={`Register ${d.child.first_name} for ${a.name}?`}
                          description={a.schedule ?? "The coordinator will share details."}
                          confirmLabel="Register"
                          triggerLabel={full ? "Full" : "Register"}
                          triggerVariant="default"
                        />
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
