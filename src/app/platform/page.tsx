import { Building2, Database, GraduationCap, Inbox, Users } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { aiStatus } from "@/lib/ai/provider";
import { withService, withUser } from "@/lib/db";
import { formatDateTime, nowMs } from "@/lib/domain/dates";
import { env } from "@/lib/env";
import { setDemoRequestStatusAction, setSchoolStatusAction } from "./actions";
import { OnboardForm } from "./onboard-form";

/**
 * SaaS operator console. Platform admins see tenants and aggregate counts
 * only; they cannot open any school's student, fee or attendance records.
 */
export default async function PlatformPage() {
  const ctx = await requirePlatformAdmin();
  const started = nowMs();
  const d = await withUser({ userId: ctx.user.id }, async (sql) => ({
    schools: await sql.many<{ school_id: string; name: string; slug: string; city: string | null; status: string; is_demo: boolean; created_at: string; onboarding_completed_at: string | null; students: number; staff: number; members: number; last_activity: string | null }>(
      "select * from platform_school_metrics()",
    ),
    requests: await sql.many<{ id: string; school_name: string; contact_name: string; email: string; phone: string; city: string | null; student_count: number | null; message: string | null; status: string; created_at: string }>(
      "select * from demo_requests order by created_at desc limit 50",
    ),
  }));
  // Migration bookkeeping lives outside the API-visible schema, so it is read in the trusted context.
  const migrations = await withService((sql) => sql.maybeOne<{ n: number }>("select count(*)::int as n from ss_meta.schema_migrations")).catch(() => null);
  const dbMs = nowMs() - started;
  const active = d.schools.filter((s) => s.status === "active");

  return (
    <>
      <PageHeader title="Platform console" description="Tenant management and aggregate metrics. Children's records are not accessible from here." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Schools" value={d.schools.length} hint={`${active.length} active · ${d.schools.filter((s) => s.status === "onboarding").length} onboarding`} icon={Building2} />
        <StatCard label="Active students" value={d.schools.reduce((s, x) => s + x.students, 0).toLocaleString("en-IN")} hint="across all schools" icon={GraduationCap} />
        <StatCard label="User memberships" value={d.schools.reduce((s, x) => s + x.members, 0)} icon={Users} />
        <StatCard label="New demo requests" value={d.requests.filter((r) => r.status === "new").length} icon={Inbox} tone={d.requests.some((r) => r.status === "new") ? "warning" : "default"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Schools</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Staff</TableHead>
                  <TableHead className="hidden lg:table-cell">Last activity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.schools.map((s) => (
                  <TableRow key={s.school_id}>
                    <TableCell>
                      <span className="font-medium">{s.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {s.slug} · {s.city ?? "—"}
                        {s.is_demo && " · demo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular">{s.students}</TableCell>
                    <TableCell className="hidden text-right tabular md:table-cell">{s.staff}</TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">{formatDateTime(s.last_activity)}</TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {s.status === "suspended" ? (
                        <ConfirmAction action={setSchoolStatusAction.bind(null, s.school_id, "active")} title={`Re-activate ${s.name}?`} description="Members regain access immediately." confirmLabel="Re-activate" />
                      ) : (
                        <ConfirmAction action={setSchoolStatusAction.bind(null, s.school_id, "suspended")} title={`Suspend ${s.name}?`} description="Every member loses access until the school is re-activated. No data is deleted." confirmLabel="Suspend" variant="destructive" triggerVariant="ghost" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Onboard a school</CardTitle>
              <CardDescription>Creates the tenant with default grade scales, policies and fee categories.</CardDescription>
            </CardHeader>
            <CardContent>
              <OnboardForm />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="size-4" aria-hidden /> Platform health
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p>Database: responding ({dbMs} ms for this page&apos;s queries) · {env().DB_DRIVER === "pglite" ? "local PGlite" : "PostgreSQL"}</p>
              <p>Migrations applied: {migrations?.n ?? "managed by Supabase CLI"}</p>
              <p>Auth: {env().AUTH_PROVIDER === "supabase" ? "Supabase Auth" : "local development provider"}</p>
              <p>Payments: {env().PAYMENTS_PROVIDER === "razorpay" ? "Razorpay" : "not configured (sandbox for demo schools only)"}</p>
              <p>AI: {aiStatus().configured ? `${aiStatus().provider}` : "not configured"}</p>
            </CardContent>
          </Card>
        </div>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Demo requests</CardTitle>
          <CardDescription>Submitted from the public website.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableBody>
              {d.requests.length === 0 && (
                <TableRow>
                  <TableCell className="py-6 text-center text-sm text-muted-foreground">No requests yet.</TableCell>
                </TableRow>
              )}
              {d.requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <span className="font-medium">{r.school_name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.contact_name} · {r.email} · {r.phone}
                      {r.city && ` · ${r.city}`}
                      {r.student_count && ` · ~${r.student_count} students`}
                    </span>
                    {r.message && <span className="block text-xs">{r.message}</span>}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{formatDateTime(r.created_at)}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status === "new" ? "pending" : r.status} label={r.status} />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {r.status === "new" && <ConfirmAction action={setDemoRequestStatusAction.bind(null, r.id, "contacted")} title="Mark as contacted?" description={r.school_name} confirmLabel="Mark contacted" triggerVariant="ghost" />}
                    {r.status === "contacted" && <ConfirmAction action={setDemoRequestStatusAction.bind(null, r.id, "converted")} title="Mark as converted?" description="Onboard the school above." confirmLabel="Converted" triggerVariant="ghost" />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
