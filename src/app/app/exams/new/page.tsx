import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requirePageContext } from "@/lib/auth/context";
import { listClasses } from "@/lib/data/academics";
import { currentYear, subjectsOf } from "@/lib/data/school";
import { ExamForm } from "../exam-form";

export const metadata: Metadata = { title: "New examination" };

export default async function NewExamPage() {
  const ctx = await requirePageContext("exams.manage");
  const d = await ctx.db(async (sql) => {
    const year = await currentYear(sql, ctx.schoolId);
    return {
      classes: await listClasses(sql, ctx.schoolId),
      terms: await sql.many<{ id: string; name: string }>("select id, name from terms where academic_year_id = $1 order by sort_order", [year.id]),
      scales: await sql.many<{ id: string; name: string; is_default: boolean }>("select id, name, is_default from grade_scales where school_id = $1 order by name", [ctx.schoolId]),
      subjects: (await subjectsOf(sql, ctx.schoolId)).filter((s) => s.is_active),
    };
  });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Schedule an examination" back={{ href: "/app/exams", label: "Exams" }} />
      <ExamForm
        classes={d.classes.map((c) => ({ value: c.id, label: c.name }))}
        terms={d.terms.map((t) => ({ value: t.id, label: t.name }))}
        scales={d.scales.map((s) => ({ value: s.id, label: `${s.name}${s.is_default ? " (default)" : ""}` }))}
        subjects={d.subjects}
      />
    </div>
  );
}
