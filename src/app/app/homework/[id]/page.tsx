import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Sparkles } from "lucide-react";
import { FileList, FileUploader } from "@/components/files";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePageContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { assignmentsForStudent, filesFor, getAssignment, homeworkState, isoToIstLocal, submissionsForAssignment } from "@/lib/data/homework";
import { familyChildren, pickChild } from "@/lib/data/school";
import { NotFoundError } from "@/lib/errors";
import { formatDateTime, nowMs } from "@/lib/domain/dates";
import { deleteFileAction } from "../actions";
import { ExtensionDialog, GradeDialog, ReminderButton, SubmitWorkForm } from "./review";

export const metadata: Metadata = { title: "Assignment" };

export default async function AssignmentPage({ params, searchParams }: PageProps<"/app/homework/[id]">) {
  const ctx = await requirePageContext("homework.view");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const staff = can(ctx.role, "homework.manage");

  const d = await ctx.db(async (sql) => {
    let a;
    try {
      a = await getAssignment(sql, id);
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
    const assignmentFiles = await filesFor(sql, "assignment", [id]);
    if (staff) {
      const subs = await submissionsForAssignment(sql, id, a.section_id);
      const subFiles = await filesFor(sql, "submission", subs.map((s) => s.submission_id).filter(Boolean) as string[]);
      const canGrade = (await sql.one<{ ok: boolean }>("select app.can_grade_assignment($1) as ok", [id])).ok;
      return { a, assignmentFiles, subs, subFiles, canGrade };
    }
    const children = await familyChildren(sql, ctx.schoolId);
    const child = pickChild(children, sp.child);
    const mine = child?.section_id ? (await assignmentsForStudent(sql, child.id, child.section_id)).find((r) => r.id === id) : undefined;
    const sub = mine?.submission_id
      ? await sql.maybeOne<{ content: string }>("select content from assignment_submissions where id = $1", [mine.submission_id])
      : null;
    const subFiles = mine?.submission_id ? await filesFor(sql, "submission", [mine.submission_id]) : [];
    return { a, assignmentFiles, child, mine, sub, subFiles };
  });
  if (!d) notFound();
  const a = d.a;
  const asFiles = (rows: { id: string; file_name: string; size_bytes: number }[], mine = false) => rows.map((f) => ({ ...f, mine }));

  return (
    <>
      <PageHeader
        title={a.title}
        description={`${a.subject_name} · ${a.section_label} · Due ${formatDateTime(a.due_at)}${a.max_marks ? ` · ${a.max_marks} marks` : ""}`}
        back={{ href: "/app/homework", label: "Homework" }}
        actions={
          "canGrade" in d &&
          d.canGrade && (
            <>
              <ReminderButton assignmentId={a.id} pendingCount={a.expected - a.submitted} />
              <Button asChild size="sm" variant="outline">
                <Link href={`/app/homework/${a.id}/edit`}>
                  <Pencil aria-hidden /> Edit
                </Link>
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Instructions <StatusBadge status={a.status} />
              {a.is_ai_assisted && (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <Sparkles className="size-3.5" aria-hidden /> Drafted with AI, reviewed by teacher
                </span>
              )}
            </CardTitle>
            <CardDescription>Set by {a.teacher_name ?? "the school"}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm whitespace-pre-wrap">{a.description || "No further instructions."}</p>
            {"canGrade" in d && d.canGrade ? (
              <FileUploader entity="assignment" entityId={a.id} files={asFiles(d.assignmentFiles, true)} removeAction={async (fid) => { "use server"; return deleteFileAction(fid, `/app/homework/${id}`); }} label="Attach worksheet" />
            ) : (
              <FileList files={asFiles(d.assignmentFiles)} />
            )}
          </CardContent>
        </Card>

        {"subs" in d ? (
          <Card>
            <CardHeader>
              <CardTitle>Completion</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <Progress value={a.expected ? (a.submitted / a.expected) * 100 : 0} aria-label="Completion" />
              <p>
                {a.submitted} of {a.expected} submitted ({a.expected ? Math.round((a.submitted / a.expected) * 100) : 0}%)
              </p>
              <p className="text-muted-foreground">
                {a.graded} reviewed · {a.late} late · {a.expected - a.submitted} pending
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
              <CardDescription>{d.child?.full_name}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {d.mine ? (
                <>
                  <StatusBadge status={homeworkState(d.mine)} className="w-fit" />
                  {d.mine.effective_due_at !== d.mine.due_at && <p className="text-muted-foreground">Extended deadline: {formatDateTime(d.mine.effective_due_at)}</p>}
                  {d.mine.submitted_at && <p className="text-muted-foreground">Submitted {formatDateTime(d.mine.submitted_at)}{d.mine.is_late ? " (late)" : ""}</p>}
                  {d.mine.marks_awarded !== null && (
                    <p className="text-base font-semibold">
                      {d.mine.marks_awarded} / {d.mine.max_marks}
                    </p>
                  )}
                  {d.mine.feedback && <p className="rounded-lg bg-accent p-2 text-accent-foreground">“{d.mine.feedback}”</p>}
                </>
              ) : (
                <p className="text-muted-foreground">Not available for this child.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {"subs" in d && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Submissions</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right">Roll</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Submitted</TableHead>
                  <TableHead className="text-right">Marks</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(d.subs ?? []).map((s) => (
                  <TableRow key={s.student_id}>
                    <TableCell className="text-right tabular">{s.roll_no ?? "—"}</TableCell>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        <StatusBadge status={s.status ?? (new Date(s.extended_due_at ?? a.due_at) < new Date() ? "overdue" : "not_submitted")} label={s.status ? undefined : new Date(s.extended_due_at ?? a.due_at) < new Date() ? "Missing" : "Not yet"} />
                        {s.is_late && <StatusBadge status="late" />}
                        {s.extended_due_at && <StatusBadge status="info" tone="info" label={`Extended to ${formatDateTime(s.extended_due_at)}`} />}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{formatDateTime(s.submitted_at)}</TableCell>
                    <TableCell className="text-right tabular">{s.marks_awarded ?? "—"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {d.canGrade && !s.submission_id && (
                        <ExtensionDialog assignmentId={a.id} studentId={s.student_id} studentName={s.full_name} defaultUntil={isoToIstLocal(new Date(Math.max(nowMs(), new Date(a.due_at).getTime()) + 2 * 86_400_000).toISOString())} />
                      )}
                      {d.canGrade && s.submission_id && (
                        <GradeDialog
                          assignmentId={a.id}
                          submissionId={s.submission_id}
                          studentName={s.full_name}
                          maxMarks={a.max_marks}
                          content={s.content ?? ""}
                          files={asFiles(d.subFiles.filter((f) => f.entity_id === s.submission_id))}
                          current={{ marks: s.marks_awarded, feedback: s.feedback, status: s.status ?? "submitted" }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {ctx.role === "student" && "mine" in d && d.mine && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Your submission</CardTitle>
            <CardDescription>You can update your submission until the teacher reviews it.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {d.mine.submission_status === "graded" ? (
              <>
                <p className="text-sm whitespace-pre-wrap">{d.sub?.content}</p>
                <FileList files={asFiles(d.subFiles)} />
              </>
            ) : homeworkState(d.mine) === "overdue" && !d.mine.allow_late_submission ? (
              <Alert>
                <AlertDescription>The deadline has passed and late submissions are not accepted. Speak to your teacher about an extension.</AlertDescription>
              </Alert>
            ) : (
              <>
                <SubmitWorkForm assignmentId={a.id} initial={d.sub?.content ?? ""} resubmit={!!d.mine.submission_id} />
                {d.mine.submission_id ? (
                  <FileUploader entity="submission" entityId={d.mine.submission_id} files={asFiles(d.subFiles, true)} removeAction={async (fid) => { "use server"; return deleteFileAction(fid, `/app/homework/${id}`); }} label="Attach your work" />
                ) : (
                  <p className="text-xs text-muted-foreground">Submit first, then attach photos or files of your work.</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
      {ctx.role === "parent" && "mine" in d && d.mine?.submission_id && d.sub && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Submitted work</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm whitespace-pre-wrap">{d.sub.content || "—"}</p>
            <FileList files={asFiles(d.subFiles)} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
