import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requirePageContext } from "@/lib/auth/context";
import { getAssignment, isoToIstLocal } from "@/lib/data/homework";
import { AssignmentForm } from "../../assignment-form";
import { homeworkSections } from "../../sections";

export const metadata: Metadata = { title: "Edit assignment" };

export default async function EditAssignmentPage({ params }: PageProps<"/app/homework/[id]/edit">) {
  const ctx = await requirePageContext("homework.manage");
  const { id } = await params;
  const a = await ctx.db((sql) => getAssignment(sql, id)).catch(() => null);
  if (!a) notFound();
  const sections = await homeworkSections(ctx);
  if (!sections.some((s) => s.id === a.section_id)) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Edit assignment" back={{ href: `/app/homework/${id}`, label: a.title }} />
      <AssignmentForm
        sections={sections}
        initial={{
          id: a.id,
          sectionId: a.section_id,
          subjectId: a.subject_id,
          title: a.title,
          description: a.description,
          dueAt: isoToIstLocal(a.due_at),
          maxMarks: a.max_marks,
          allowLate: a.allow_late_submission,
          status: a.status,
        }}
      />
    </div>
  );
}
