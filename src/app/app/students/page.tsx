import type { Metadata } from "next";
import Link from "next/link";
import { Download, GraduationCap, Upload, UserPlus, ArrowRightLeft } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { requirePageContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { currentYear, sectionsOfYear } from "@/lib/data/school";
import { listStudents } from "@/lib/data/students";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage({ searchParams }: PageProps<"/app/students">) {
  const ctx = await requirePageContext("students.view");
  const sp = await searchParams;
  const { rows, sections } = await ctx.db(async (sql) => {
    const year = await currentYear(sql, ctx.schoolId);
    return { rows: await listStudents(sql, ctx.schoolId, year.id), sections: await sectionsOfYear(sql, ctx.schoolId, year.id) };
  });
  const manage = can(ctx.role, "students.manage");
  const visibleSections = sections.filter((s) => rows.some((r) => r.section_id === s.id));

  return (
    <>
      <PageHeader
        title="Students"
        description={manage ? "Admissions, guardians and enrollment for the current academic year." : "Students in the classes you work with."}
        actions={
          manage && (
            <>
              <Button asChild variant="outline" size="sm">
                <a href="/api/export/students">
                  <Download aria-hidden /> Export CSV
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/app/students/promote">
                  <ArrowRightLeft aria-hidden /> Promote / move
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/app/students/import">
                  <Upload aria-hidden /> Import CSV
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/app/students/new">
                  <UserPlus aria-hidden /> Admit student
                </Link>
              </Button>
            </>
          )
        }
      />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        searchParams={sp}
        caption="Students"
        search={{ placeholder: "Search name, admission no or guardian phone", text: (r) => `${r.full_name} ${r.admission_no} ${r.guardian_phone ?? ""} ${r.guardian_name ?? ""}` }}
        filters={[
          { param: "section", label: "Section", options: visibleSections.map((s) => ({ value: s.id, label: s.label })), match: (r, v) => r.section_id === v },
          {
            param: "status",
            label: "Status",
            options: ["active", "transferred", "withdrawn", "graduated"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })),
            match: (r, v) => r.status === v,
          },
          { param: "verify", label: "Guardian links", options: [{ value: "pending", label: "Awaiting verification" }], match: (r) => r.unverified_links > 0 },
        ]}
        empty={{
          title: "No students yet",
          description: manage ? "Admit your first student or import a CSV from your current register." : "You are not assigned to any section yet.",
          action: manage ? (
            <Button asChild size="sm">
              <Link href="/app/students/new">Admit student</Link>
            </Button>
          ) : undefined,
        }}
        columns={[
          {
            key: "name",
            header: "Student",
            sort: (r) => r.full_name,
            cell: (r) => (
              <Link href={`/app/students/${r.id}`} className="font-medium hover:text-primary hover:underline">
                {r.full_name}
              </Link>
            ),
          },
          { key: "adm", header: "Admission no", sort: (r) => r.admission_no, cell: (r) => <span className="tabular">{r.admission_no}</span>, hideBelow: "sm" },
          { key: "section", header: "Class", sort: (r) => (r.grade_level ?? 99) * 100 + (r.section_label?.charCodeAt(r.section_label.length - 1) ?? 0), cell: (r) => r.section_label ?? "—" },
          { key: "roll", header: "Roll", sort: (r) => r.roll_no, cell: (r) => r.roll_no ?? "—", align: "right", hideBelow: "md" },
          {
            key: "guardian",
            header: "Primary guardian",
            cell: (r) => (
              <span className="text-sm">
                {r.guardian_name ?? "—"}
                {r.guardian_phone && <span className="block text-xs text-muted-foreground tabular">{r.guardian_phone}</span>}
              </span>
            ),
            hideBelow: "md",
          },
          {
            key: "status",
            header: "Status",
            sort: (r) => r.status,
            cell: (r) => (
              <span className="flex flex-wrap gap-1">
                <StatusBadge status={r.status} />
                {r.unverified_links > 0 && <StatusBadge status="pending" label="Link unverified" />}
              </span>
            ),
          },
        ]}
      />
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <GraduationCap className="size-3.5" aria-hidden /> {rows.filter((r) => r.status === "active").length} active of {rows.length} students
      </p>
    </>
  );
}
