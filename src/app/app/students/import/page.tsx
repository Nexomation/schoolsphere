import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { IMPORT_COLUMNS } from "@/lib/data/students";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import students" };

export default async function ImportStudentsPage() {
  await requirePageContext("students.manage");
  const sample = [
    IMPORT_COLUMNS.join(","),
    "SVM0901,Meera,Krishnan,14/03/2014,female,Class 6,A,9,Krishnan R,father,9876543210,krishnan@example.com,B+,\"5, Anna Street, Coimbatore\",",
  ].join("\n");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Import students from CSV"
        description="Upload a spreadsheet exported from your current register. Nothing is saved until you review the results and confirm."
        back={{ href: "/app/students", label: "Students" }}
      />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>File format</CardTitle>
            <CardDescription>
              First row must be the column headers below. Required: admission_no, first_name, date_of_birth, gender, class, section, guardian_name,
              guardian_phone. Dates may be DD/MM/YYYY or YYYY-MM-DD. Classes must already exist in the current academic year.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{sample}</pre>
            <a
              className="mt-2 inline-block text-sm text-primary hover:underline"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(sample)}`}
              download="schoolsphere-student-import-template.csv"
            >
              Download template
            </a>
          </CardContent>
        </Card>
        <ImportWizard />
      </div>
    </div>
  );
}
