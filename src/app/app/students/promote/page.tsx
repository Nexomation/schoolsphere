import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requirePageContext } from "@/lib/auth/context";
import { PromoteForm } from "./promote-form";

export const metadata: Metadata = { title: "Promote students" };

export default async function PromotePage() {
  const ctx = await requirePageContext("students.manage");
  const data = await ctx.db(async (sql) => {
    const sections = await sql.many<{ id: string; label: string; year: string; is_current: boolean }>(
      `select sec.id, c.name || ' ' || sec.name as label, y.name as year, y.is_current
       from sections sec join classes c on c.id = sec.class_id join academic_years y on y.id = sec.academic_year_id
       where sec.school_id = $1 order by y.start_date desc, c.grade_level, sec.name`,
      [ctx.schoolId],
    );
    const students = await sql.many<{ id: string; name: string; section_id: string; roll_no: number | null }>(
      `select s.id, trim(s.first_name || ' ' || s.last_name) as name, e.section_id, e.roll_no
       from enrollments e join students s on s.id = e.student_id
       where e.school_id = $1 and e.status = 'active' and s.status = 'active' order by e.roll_no nulls last, s.first_name`,
      [ctx.schoolId],
    );
    return { sections, students };
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Promote or move students"
        description="Moving into a section of a later academic year promotes the students (their old enrollment is kept as history). Moving within the same year changes their section."
        back={{ href: "/app/students", label: "Students" }}
      />
      <PromoteForm
        sections={data.sections.map((s) => ({ value: s.id, label: `${s.label} (${s.year}${s.is_current ? ", current" : ""})` }))}
        students={data.students}
      />
      {data.sections.every((s) => s.is_current) && (
        <p className="mt-4 text-sm text-muted-foreground">
          To promote into next year, first create the next academic year and its sections in Classes &amp; subjects.
        </p>
      )}
    </div>
  );
}
