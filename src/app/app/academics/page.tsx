import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requirePageContext } from "@/lib/auth/context";
import { listAssignments, listClasses, listStaff, listYears } from "@/lib/data/academics";
import { maybeCurrentYear, sectionsOfYear, subjectsOf } from "@/lib/data/school";
import { formatDate } from "@/lib/domain/dates";
import { deleteAssignmentAction, setCurrentYearAction, setSubjectActiveAction } from "./actions";
import { AssignmentForm, ClassForm, ClassTeacherPicker, SectionForm, SubjectForm, YearForm } from "./forms";

export const metadata: Metadata = { title: "Classes & subjects" };

export default async function AcademicsPage({ searchParams }: PageProps<"/app/academics">) {
  const ctx = await requirePageContext("academics.manage");
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "classes";
  const d = await ctx.db(async (sql) => {
    const year = await maybeCurrentYear(sql, ctx.schoolId);
    return {
      year,
      years: await listYears(sql, ctx.schoolId),
      classes: await listClasses(sql, ctx.schoolId),
      sections: year ? await sectionsOfYear(sql, ctx.schoolId, year.id) : [],
      subjects: await subjectsOf(sql, ctx.schoolId),
      staff: (await listStaff(sql, ctx.schoolId)).filter((s) => s.status === "active"),
      assignments: year ? await listAssignments(sql, ctx.schoolId, year.id) : [],
    };
  });
  const teacherOptions = d.staff.filter((s) => s.staff_type === "teaching" || s.staff_type === "administrative").map((s) => ({ value: s.id, label: s.full_name }));

  return (
    <>
      <PageHeader title="Classes & subjects" description={d.year ? `Current academic year: ${d.year.name}` : "No current academic year yet — create one first."} />
      <Tabs defaultValue={tab}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="classes">Classes & sections</TabsTrigger>
          <TabsTrigger value="assignments">Teacher assignments</TabsTrigger>
          <TabsTrigger value="subjects">Subjects</TabsTrigger>
          <TabsTrigger value="years">Academic years</TabsTrigger>
        </TabsList>

        <TabsContent value="classes" className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Sections in {d.year?.name ?? "the current year"}</CardTitle>
              <CardDescription>Class teachers can mark attendance and work with every subject in their section.</CardDescription>
            </CardHeader>
            <CardContent>
              {d.sections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sections yet. Add a class, then a section below.</p>
              ) : (
                <ul className="divide-y">
                  {d.sections.map((s) => (
                    <li key={s.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        <span className="font-medium">{s.label}</span>
                        <span className="ml-2 text-sm text-muted-foreground">
                          {s.student_count} students{s.room ? ` · Room ${s.room}` : ""}
                        </span>
                      </span>
                      <ClassTeacherPicker sectionId={s.id} value={s.class_teacher_id} staff={teacherOptions} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Add a section</CardTitle>
              </CardHeader>
              <CardContent>
                {d.year ? (
                  <SectionForm classes={d.classes.map((c) => ({ value: c.id, label: c.name }))} staff={teacherOptions} />
                ) : (
                  <p className="text-sm text-muted-foreground">Create a current academic year first.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Classes</CardTitle>
                <CardDescription>{d.classes.map((c) => c.name).join(", ") || "None yet"}</CardDescription>
              </CardHeader>
              <CardContent>
                <ClassForm />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="assignments" className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Assign a teacher</CardTitle>
              <CardDescription>Teachers can only see and record data for the sections and subjects assigned here.</CardDescription>
            </CardHeader>
            <CardContent>
              <AssignmentForm
                staff={teacherOptions}
                sections={d.sections.map((s) => ({ value: s.id, label: s.label }))}
                subjects={d.subjects.filter((s) => s.is_active).map((s) => ({ value: s.id, label: s.name }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              {d.assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No teacher assignments yet.</p>
              ) : (
                <ul className="divide-y">
                  {d.assignments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span>
                        <span className="font-medium">{a.section_label}</span> · {a.subject_name ?? "All subjects"}
                        <span className="block text-muted-foreground">{a.staff_name}</span>
                      </span>
                      <ConfirmAction
                        action={deleteAssignmentAction.bind(null, a.id)}
                        title="Remove this assignment?"
                        description={`${a.staff_name} will lose access to ${a.subject_name ?? "all subjects"} in ${a.section_label}.`}
                        confirmLabel="Remove"
                        variant="destructive"
                        trigger={
                          <Button size="icon-sm" variant="ghost" aria-label="Remove assignment">
                            <Trash2 />
                          </Button>
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subjects" className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Subjects</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ul className="divide-y">
                {d.subjects.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>
                      {s.name} <span className="text-muted-foreground">({s.code})</span>
                      {!s.is_active && <StatusBadge status="inactive" label="Archived" className="ml-2" />}
                    </span>
                    <ConfirmAction
                      action={setSubjectActiveAction.bind(null, s.id, !s.is_active)}
                      title={s.is_active ? `Archive ${s.name}?` : `Restore ${s.name}?`}
                      description={s.is_active ? "Archived subjects keep their history but cannot be used for new homework or exams." : "The subject becomes available again."}
                      confirmLabel={s.is_active ? "Archive" : "Restore"}
                    />
                  </li>
                ))}
              </ul>
              <SubjectForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="years" className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Academic years</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {d.years.map((y) => (
                  <li key={y.id} className="py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {y.name} {y.is_current && <StatusBadge status="active" label="Current" className="ml-1" />}
                      </span>
                      {!y.is_current && (
                        <ConfirmAction
                          action={setCurrentYearAction.bind(null, y.id)}
                          title={`Make ${y.name} the current year?`}
                          description="Attendance, homework, fees and dashboards will switch to this year for everyone in the school."
                          confirmLabel="Make current"
                        />
                      )}
                    </div>
                    <p className="text-muted-foreground">
                      {formatDate(y.start_date)} – {formatDate(y.end_date)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {y.terms.map((t) => `${t.name}: ${formatDate(t.start_date)} – ${formatDate(t.end_date)}`).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Add academic year</CardTitle>
              <CardDescription>Tamil Nadu schools usually run June to April.</CardDescription>
            </CardHeader>
            <CardContent>
              <YearForm />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
