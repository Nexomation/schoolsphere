import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UserMinus } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { listStaff } from "@/lib/data/academics";
import { listDrivers, listRoutes, listVehicles, routeStops, routeStudents } from "@/lib/data/transport";
import { mapConfig } from "@/lib/map-config";
import { endAssignmentAction } from "../../actions";
import { AssignStudentForm, RouteDialog, StopEditor } from "../../forms";

export const metadata: Metadata = { title: "Route" };

export default async function RoutePage({ params }: PageProps<"/app/transport/routes/[id]">) {
  const ctx = await requirePageContext("transport.manage");
  const { id } = await params;
  const d = await ctx.db(async (sql) => {
    const route = (await listRoutes(sql, ctx.schoolId)).find((r) => r.id === id);
    if (!route) return null;
    return {
      route,
      stops: await routeStops(sql, id),
      students: await routeStudents(sql, id),
      vehicles: await listVehicles(sql, ctx.schoolId),
      drivers: await listDrivers(sql, ctx.schoolId),
      staff: (await listStaff(sql, ctx.schoolId)).filter((s) => s.status === "active" && s.staff_type === "transport"),
      allStudents: await sql.many<{ id: string; name: string; section_label: string | null }>(
        `select s.id, trim(s.first_name || ' ' || s.last_name) as name, c.name || ' ' || sec.name as section_label
         from students s left join enrollments e on e.student_id = s.id and e.status = 'active'
         left join sections sec on sec.id = e.section_id left join classes c on c.id = sec.class_id
         where s.school_id = $1 and s.status = 'active' order by s.first_name`,
        [ctx.schoolId],
      ),
    };
  });
  if (!d) notFound();
  const map = mapConfig();
  const onRoute = new Set(d.students.map((s) => s.student_id));

  return (
    <>
      <PageHeader
        title={`${d.route.code} · ${d.route.name}`}
        description={`${d.route.vehicle ?? "No vehicle"} · ${d.route.driver ?? "No driver"} · ${d.students.length} students`}
        back={{ href: "/app/transport/routes", label: "Routes" }}
        actions={
          <RouteDialog
            route={d.route}
            vehicles={d.vehicles.map((v) => ({ value: v.id, label: v.registration_no }))}
            drivers={d.drivers.map((x) => ({ value: x.id, label: x.name }))}
            staff={d.staff.map((s) => ({ value: s.id, label: s.full_name }))}
          />
        }
      />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Stops</CardTitle>
          <CardDescription>Ordered as driven in the morning; afternoon drop trips run in reverse.</CardDescription>
        </CardHeader>
        <CardContent>
          <StopEditor routeId={d.route.id} stops={d.stops} tileUrl={map.tileUrl} attribution={map.attribution} />
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Students on this route</CardTitle>
          </CardHeader>
          <CardContent>
            {d.students.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students assigned.</p>
            ) : (
              <ul className="divide-y text-sm">
                {d.students.map((s) => (
                  <li key={s.assignment_id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{s.name}</span> <span className="text-muted-foreground">{s.section_label}</span>
                      <span className="block text-xs text-muted-foreground">
                        Stop {s.stop_order}: {s.stop_name} · {[s.uses_pickup && "pickup", s.uses_drop && "drop"].filter(Boolean).join(" & ")}
                      </span>
                    </span>
                    <ConfirmAction
                      action={endAssignmentAction.bind(null, s.assignment_id)}
                      title={`Remove ${s.name} from this route?`}
                      description="The assignment ends today; past trip records are kept."
                      confirmLabel="Remove"
                      variant="destructive"
                      trigger={
                        <Button size="icon-sm" variant="ghost" aria-label={`Remove ${s.name}`}>
                          <UserMinus />
                        </Button>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Assign a student</CardTitle>
            <CardDescription>Add the transport fee separately in the student&apos;s fee ledger.</CardDescription>
          </CardHeader>
          <CardContent>
            {d.stops.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add stops first.</p>
            ) : (
              <AssignStudentForm
                routeId={d.route.id}
                students={d.allStudents.filter((s) => !onRoute.has(s.id)).map((s) => ({ value: s.id, label: `${s.name}${s.section_label ? ` (${s.section_label})` : ""}` }))}
                stops={d.stops.map((s) => ({ value: s.id, label: `${s.stop_order}. ${s.name}` }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
