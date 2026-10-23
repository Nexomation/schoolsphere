import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requirePageContext } from "@/lib/auth/context";
import { getStudent } from "@/lib/data/students";
import { NotFoundError } from "@/lib/errors";
import { EditStudentForm } from "../../student-forms";

export const metadata: Metadata = { title: "Edit student" };

export default async function EditStudentPage({ params }: PageProps<"/app/students/[id]/edit">) {
  const ctx = await requirePageContext("students.manage");
  const { id } = await params;
  const student = await ctx.db((sql) => getStudent(sql, id)).catch((e) => {
    if (e instanceof NotFoundError || (e as { code?: string }).code === "22P02") return null;
    throw e;
  });
  if (!student) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit ${student.full_name}`} back={{ href: `/app/students/${id}`, label: student.full_name }} />
      <EditStudentForm student={student} />
    </div>
  );
}
