import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requirePageContext } from "@/lib/auth/context";
import { AssignmentForm } from "../assignment-form";
import { homeworkSections } from "../sections";

export const metadata: Metadata = { title: "New assignment" };

export default async function NewAssignmentPage() {
  const ctx = await requirePageContext("homework.manage");
  const sections = await homeworkSections(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New assignment" description="After saving you can attach worksheets or reference files." back={{ href: "/app/homework", label: "Homework" }} />
      {sections.length ? <AssignmentForm sections={sections} /> : <EmptyState title="No sections assigned to you" />}
    </div>
  );
}
