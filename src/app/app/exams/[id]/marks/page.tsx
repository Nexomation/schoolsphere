import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { UrlPicker } from "@/components/url-controls";
import { requirePageContext } from "@/lib/auth/context";
import { examSubjects, getExam, marksRoster } from "@/lib/data/exams";
import { teachingSections } from "@/lib/data/school";
import { MarksGrid } from "./marks-grid";

export const metadata: Metadata = { title: "Enter marks" };

export default async function MarksEntryPage({ params, searchParams }: PageProps<"/app/exams/[id]/marks">) {
  const ctx = await requirePageContext("marks.enter");
  const { id } = await params;
  const sp = await searchParams;
  const d = await ctx.db(async (sql) => {
    const exam = await getExam(sql, id).catch(() => null);
    if (!exam) return null;
    let subjects = await examSubjects(sql, id);
    let sectionFilter: string[] | null = null;
    if (ctx.role === "teacher") {
      const teaching = (await teachingSections(sql, ctx.schoolId, ctx.userId, exam.academic_year_id)).filter((s) => s.class_id === exam.class_id);
      subjects = subjects.filter((s) => teaching.some((t) => t.subjects.some((x) => x.id === s.subject_id)));
      const subject = subjects.find((s) => s.id === sp.subject) ?? subjects[0];
      sectionFilter = subject ? teaching.filter((t) => t.subjects.some((x) => x.id === subject.subject_id)).map((t) => t.id) : [];
    }
    const subject = subjects.find((s) => s.id === sp.subject) ?? subjects[0];
    if (!subject) return { exam, subjects, subject: null, rows: [] };
    const rows = (await marksRoster(sql, subject.id, null)).filter((r) => !sectionFilter || sectionFilter.includes(r.section_id));
    return { exam, subjects, subject, rows };
  });
  if (!d) notFound();
  const published = d.exam.status === "published";
  if (published && ctx.role !== "school_admin") notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`${d.exam.name} — ${d.subject?.name ?? "Marks"}`}
        description={d.exam.class_name}
        back={{ href: `/app/exams/${d.exam.id}`, label: d.exam.name }}
        actions={
          d.subject &&
          d.subjects.length > 1 && <UrlPicker param="subject" label="Subject" value={d.subject.id} options={d.subjects.map((s) => ({ value: s.id, label: s.name }))} />
        }
      />
      {!d.subject || d.rows.length === 0 ? (
        <EmptyState title="Nothing to enter" description="You are not assigned to teach a subject of this examination's class." />
      ) : (
        <MarksGrid key={d.subject.id} examSubjectId={d.subject.id} maxMarks={d.subject.max_marks} passMarks={d.subject.pass_marks} rows={d.rows} published={published} />
      )}
    </div>
  );
}
