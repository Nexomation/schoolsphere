import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requirePageContext } from "@/lib/auth/context";
import { aiStatus } from "@/lib/ai/provider";
import { currentYear, sectionsOfYear, subjectsOf, teachingSections } from "@/lib/data/school";
import { Assistant } from "./assistant";

export const metadata: Metadata = { title: "AI assistant" };

export default async function AssistantPage() {
  const ctx = await requirePageContext("ai.use");
  const status = aiStatus();
  const d = await ctx.db(async (sql) => {
    const year = await currentYear(sql, ctx.schoolId);
    const sections =
      ctx.role === "teacher"
        ? (await teachingSections(sql, ctx.schoolId, ctx.userId, year.id)).map((s) => ({ value: s.id, label: s.label, classId: s.class_id }))
        : (await sectionsOfYear(sql, ctx.schoolId, year.id)).map((s) => ({ value: s.id, label: s.label, classId: s.class_id }));
    // Students visible under RLS (teachers: their sections only).
    const students = ctx.role === "accountant" ? [] : await sql.many<{ id: string; name: string; section: string | null; class_id: string | null }>(
      `select s.id, trim(s.first_name || ' ' || s.last_name) as name, c.name || ' ' || sec.name as section, sec.class_id
       from students s join enrollments e on e.student_id = s.id and e.status = 'active' join sections sec on sec.id = e.section_id join classes c on c.id = sec.class_id
       where s.school_id = $1 and s.status = 'active' order by c.grade_level, sec.name, s.first_name`,
      [ctx.schoolId],
    );
    const exams = await sql.many<{ id: string; name: string; class_id: string }>(
      "select id, name, class_id from examinations where school_id = $1 and academic_year_id = $2 and status <> 'draft' order by start_date desc nulls last",
      [ctx.schoolId, year.id],
    );
    return { sections, students, exams, subjects: (await subjectsOf(sql, ctx.schoolId)).filter((s) => s.is_active) };
  });

  return (
    <>
      <PageHeader title="AI assistant" description="Drafting help for staff. Everything it produces is a suggestion for you to review — it never publishes, grades or decides on its own." />
      {!status.configured && (
        <Alert className="mb-6">
          <Sparkles aria-hidden />
          <AlertTitle>Live AI responses are not configured</AlertTitle>
          <AlertDescription>
            Set AI_PROVIDER (anthropic or openai) and the matching API key on the server to enable generated text. Until then each tool still works, using templates built from school records.
          </AlertDescription>
        </Alert>
      )}
      <Assistant
        role={ctx.role}
        sections={d.sections}
        students={d.students.map((s) => ({ value: s.id, label: `${s.name}${s.section ? ` (${s.section})` : ""}`, classId: s.class_id }))}
        exams={d.exams.map((e) => ({ value: e.id, label: e.name, classId: e.class_id }))}
        subjects={d.subjects.map((s) => ({ value: s.id, label: s.name }))}
      />
    </>
  );
}
