import type { Metadata } from "next";
import { ConfirmAction } from "@/components/confirm-action";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import type { GradeBand } from "@/lib/domain/grading";
import { setDefaultScaleAction } from "../actions";
import { GradeScaleForm } from "../forms";

export const metadata: Metadata = { title: "Grading" };

export default async function GradingPage() {
  const ctx = await requirePageContext("settings.manage");
  const scales = await ctx.db((sql) =>
    sql.many<{ id: string; name: string; bands: GradeBand[]; is_default: boolean }>("select id, name, bands, is_default from grade_scales where school_id = $1 order by is_default desc, name", [ctx.schoolId]),
  );
  return (
    <>
      <PageHeader title="Grade scales" description="Each examination uses one scale. Changing a scale does not alter marks already entered." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          {scales.map((s) => (
            <Card key={s.id} className="gap-3 py-4">
              <CardHeader className="flex-row items-center justify-between px-4">
                <CardTitle className="text-base">
                  {s.name} {s.is_default && <StatusBadge status="active" label="Default" className="ml-2" />}
                </CardTitle>
                {!s.is_default && <ConfirmAction action={setDefaultScaleAction.bind(null, s.id)} title={`Make "${s.name}" the default?`} description="New examinations will use it unless another scale is chosen." confirmLabel="Make default" />}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5 px-4 text-xs">
                {s.bands.map((b) => (
                  <span key={b.grade} className="rounded-md border px-2 py-1">
                    <strong>{b.grade}</strong> ≥ {b.minPercent}%{b.gradePoint !== undefined ? ` · ${b.gradePoint} pts` : ""}
                  </span>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>New grade scale</CardTitle>
          </CardHeader>
          <CardContent>
            <GradeScaleForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
