import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AdminDashboard } from "@/components/dashboards/admin-dashboard";
import { AccountantDashboard } from "@/components/dashboards/accountant-dashboard";
import { TeacherDashboard } from "@/components/dashboards/teacher-dashboard";
import { FamilyDashboard } from "@/components/dashboards/family-dashboard";
import { TransportDashboard } from "@/components/dashboards/transport-dashboard";
import { DriverDashboard } from "@/components/dashboards/driver-dashboard";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { maybeCurrentYear } from "@/lib/data/school";
import { requirePageContext } from "@/lib/auth/context";
import { ROLE_LABELS } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage({ searchParams }: PageProps<"/app">) {
  const ctx = await requirePageContext("dashboard.view");
  const sp = await searchParams;
  const setupPending =
    ctx.role === "school_admin" &&
    !(await ctx.db((sql) => sql.one<{ done: boolean }>("select onboarding_completed_at is not null as done from schools where id = $1", [ctx.schoolId]))).done;
  // A newly onboarded school has no academic year yet; dashboards need one.
  const hasYear = !!(await ctx.db((sql) => maybeCurrentYear(sql, ctx.schoolId)));
  const firstName = ctx.user.fullName.replace(/^(Dr|Mr|Mrs|Ms)\.?\s+/i, "").split(" ")[0];

  return (
    <>
      <PageHeader title={`${greeting()}, ${firstName}`} description={`${ctx.active.schoolName} · ${ROLE_LABELS[ctx.role]}`} />
      {sp.denied && (
        <Alert className="mb-6">
          <AlertDescription>That page is not available for your role, so you were brought back to your dashboard.</AlertDescription>
        </Alert>
      )}
      {setupPending && (
        <Alert className="mb-6">
          <AlertDescription>
            Your school setup is not finished.{" "}
            <Link href="/app/setup" className="font-medium text-primary underline">
              Continue the setup wizard
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {!hasYear && (
        <EmptyState
          title="This school is still being set up"
          description={ctx.role === "school_admin" ? "Create the academic year, classes and subjects to start using SchoolSphere." : "Your school administrator is still configuring the academic year. Please check back soon."}
          action={
            ctx.role === "school_admin" ? (
              <Button asChild size="sm">
                <Link href="/app/setup">Open setup wizard</Link>
              </Button>
            ) : undefined
          }
        />
      )}
      {hasYear && ctx.role === "school_admin" && <AdminDashboard ctx={ctx} />}
      {hasYear && ctx.role === "accountant" && <AccountantDashboard ctx={ctx} />}
      {hasYear && ctx.role === "teacher" && <TeacherDashboard ctx={ctx} />}
      {hasYear && (ctx.role === "parent" || ctx.role === "student") && <FamilyDashboard ctx={ctx} searchParams={sp} />}
      {hasYear && ctx.role === "transport_coordinator" && <TransportDashboard ctx={ctx} />}
      {hasYear && ctx.role === "driver" && <DriverDashboard ctx={ctx} />}
    </>
  );
}
