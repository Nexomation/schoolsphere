import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { schoolProfile } from "@/lib/data/school";
import { resolvePolicy } from "@/lib/domain/attendance";
import { PolicyForm } from "../forms";

export const metadata: Metadata = { title: "Policies" };

export default async function PoliciesPage() {
  const ctx = await requirePageContext("settings.manage");
  const p = await ctx.db((sql) => schoolProfile(sql, ctx.schoolId));
  const att = resolvePolicy(p.settings);
  const s = p.settings as { attendanceEditWindowDays?: number; absentPolicy?: "absent_counts_as_zero" | "absent_excluded"; receiptPrefix?: string };
  return (
    <>
      <PageHeader title="Policies" description="How attendance percentages, exam absences and receipts are calculated for your school." />
      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <PolicyForm
            initial={{
              ...att,
              attendanceEditWindowDays: s.attendanceEditWindowDays ?? 7,
              absentPolicy: s.absentPolicy ?? "absent_counts_as_zero",
              receiptPrefix: s.receiptPrefix ?? p.slug.replace(/[^a-z]/g, "").slice(0, 3).toUpperCase(),
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
