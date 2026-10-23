import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePageContext } from "@/lib/auth/context";
import { currentYear, schoolToday, sectionsOfYear } from "@/lib/data/school";
import { AdmissionForm } from "../student-forms";

export const metadata: Metadata = { title: "Admit student" };

export default async function NewStudentPage() {
  const ctx = await requirePageContext("students.manage");
  const { sections, today } = await ctx.db(async (sql) => ({
    sections: await sectionsOfYear(sql, ctx.schoolId, (await currentYear(sql, ctx.schoolId)).id),
    today: await schoolToday(sql, ctx.schoolId),
  }));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Admit a student" description="Creates the student record, enrolls them in a section and links their guardian." back={{ href: "/app/students", label: "Students" }} />
      {sections.length === 0 ? (
        <EmptyState
          title="Create classes and sections first"
          description="Students are enrolled into a section of the current academic year."
          action={
            <Button asChild size="sm">
              <Link href="/app/academics">Set up classes</Link>
            </Button>
          }
        />
      ) : (
        <AdmissionForm sections={sections.map((s) => ({ value: s.id, label: s.label }))} today={today} />
      )}
    </div>
  );
}
