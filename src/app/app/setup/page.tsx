import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { setupProgress, STANDARD_CLASSES, SUBJECT_PRESETS } from "@/lib/data/onboarding";
import { schoolProfile, subjectsOf } from "@/lib/data/school";
import { cn } from "@/lib/utils";
import { YearForm } from "../academics/forms";
import { BrandingForm, ProfileForm } from "../settings/forms";
import { FinishSetup, PresetSubjects, QuickClasses } from "./steps";

export const metadata: Metadata = { title: "Set up your school" };

function Step({ n, title, description, done, children }: { n: number; title: string; description: string; done: boolean; children: React.ReactNode }) {
  return (
    <Card className={cn(done && "border-success/40")}>
      <CardHeader className="flex-row items-start gap-3">
        {done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="To do" />}
        <div>
          <CardTitle>
            {n}. {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Configuration wizard for a newly onboarded school. Each step shows its real status from the database. */
export default async function SetupPage() {
  const ctx = await requirePageContext("settings.manage");
  const p = await setupProgress(ctx.userId, ctx.schoolId);
  const d = await ctx.db(async (sql) => ({ profile: await schoolProfile(sql, ctx.schoolId), subjects: await subjectsOf(sql, ctx.schoolId) }));
  const ready = p.year && p.sections > 0 && p.subjects > 0;

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader title={p.done ? "School setup" : `Welcome! Let's set up ${ctx.active.schoolName}`} description="About 10 minutes. You can change everything later in Settings and Classes & subjects." />
      <Step n={1} title="School profile" description="Address and contact details appear on receipts and report cards." done={p.profile}>
        <ProfileForm profile={d.profile} />
      </Step>
      <Step n={2} title="Academic year" description="Tamil Nadu schools usually run from June to April." done={p.year}>
        {p.year ? <p className="text-sm text-muted-foreground">A current academic year is set.</p> : <YearForm />}
      </Step>
      <Step n={3} title="Classes and sections" description={`${p.classes} classes, ${p.sections} sections in the current year.`} done={p.sections > 0}>
        {p.year ? <QuickClasses classes={STANDARD_CLASSES} /> : <p className="text-sm text-muted-foreground">Create the academic year first.</p>}
      </Step>
      <Step n={4} title="Subjects" description={`${p.subjects} subjects.`} done={p.subjects > 0}>
        <PresetSubjects presets={SUBJECT_PRESETS} existing={d.subjects.map((s) => s.code)} />
      </Step>
      <Step n={5} title="Branding (optional)" description="Your school's name and colour in the app." done={!!d.profile.branding.primaryColor}>
        <BrandingForm branding={d.profile.branding} />
      </Step>
      <Step n={6} title="People" description={`${p.staff} staff, ${p.students} students so far.`} done={p.staff > 0 && p.students > 0}>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/app/staff">Add staff &amp; invite teachers</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/app/students/import">Import students from CSV</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/app/fees/setup">Set up fees</Link>
          </Button>
        </div>
      </Step>
      {!p.done && (
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">{ready ? "The essentials are in place." : "Complete steps 2–4 to finish."}</p>
          <FinishSetup ready={ready} />
        </div>
      )}
    </div>
  );
}
