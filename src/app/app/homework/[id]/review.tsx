"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CalendarPlus, Loader2 } from "lucide-react";
import { z } from "zod";
import { FileList, type FileItem } from "@/components/files";
import { SubmitButton, TextareaField, TextField } from "@/components/form/fields";
import { useActionForm, useActionRunner } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { gradeSubmissionAction, grantExtensionAction, sendReminderAction, submitWorkAction } from "../actions";

export function GradeDialog({
  assignmentId,
  submissionId,
  studentName,
  maxMarks,
  content,
  files,
  current,
}: {
  assignmentId: string;
  submissionId: string;
  studentName: string;
  maxMarks: number | null;
  content: string;
  files: FileItem[];
  current: { marks: number | null; feedback: string | null; status: string };
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const schema = z.object({
    marks: maxMarks === null ? z.string().optional() : z.union([z.literal(""), z.coerce.number().min(0).max(maxMarks, `At most ${maxMarks}`)]),
    feedback: z.string().max(5000).optional(),
  });
  const { form, onSubmit, pending } = useActionForm({
    schema,
    defaultValues: { marks: current.marks === null ? "" : String(current.marks), feedback: current.feedback ?? "" } as never,
    action: (v: { marks?: unknown; feedback?: string }) => gradeSubmissionAction({ assignmentId, submissionId, marks: v.marks ?? "", feedback: v.feedback, action: "grade" }),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const { run, pending: returning } = useActionRunner();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={current.status === "graded" ? "ghost" : "outline"}>
          {current.status === "graded" ? "Edit review" : "Review"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{studentName}</DialogTitle>
          <DialogDescription>Feedback is visible to the student and their parents.</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{content || <span className="text-muted-foreground">No text answer.</span>}</div>
        <FileList files={files} />
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {maxMarks !== null && <TextField control={form.control} name="marks" label={`Marks (out of ${maxMarks})`} type="number" inputMode="decimal" />}
          <TextareaField control={form.control} name="feedback" label="Feedback" rows={3} />
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={returning}
              onClick={() =>
                run(() => gradeSubmissionAction({ assignmentId, submissionId, feedback: form.getValues("feedback" as never), action: "return" }), {
                  onSuccess: () => {
                    setOpen(false);
                    router.refresh();
                  },
                })
              }
            >
              Return for changes
            </Button>
            <SubmitButton pending={pending} size="default">
              Save review
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExtensionDialog({ assignmentId, studentId, studentName, defaultUntil }: { assignmentId: string; studentId: string; studentName: string; defaultUntil: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const schema = z.object({ until: z.string().min(16, "Choose a date and time"), reason: z.string().trim().min(3, "Give a short reason") });
  const { form, onSubmit, pending } = useActionForm({
    schema,
    defaultValues: { until: defaultUntil, reason: "" },
    action: (v) => grantExtensionAction({ assignmentId, studentId, ...v }),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Extend deadline for ${studentName}`} title="Extend deadline">
          <CalendarPlus />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend deadline for {studentName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <TextField control={form.control} name="until" label="New deadline (IST)" type="datetime-local" required />
          <TextareaField control={form.control} name="reason" label="Reason" rows={2} required />
          <SubmitButton pending={pending} size="default">
            Grant extension
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReminderButton({ assignmentId, pendingCount }: { assignmentId: string; pendingCount: number }) {
  const { run, pending } = useActionRunner();
  return (
    <Button size="sm" variant="outline" disabled={pending || pendingCount === 0} onClick={() => run(() => sendReminderAction(assignmentId))}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <BellRing aria-hidden />}
      Remind {pendingCount} pending
    </Button>
  );
}

export function SubmitWorkForm({ assignmentId, initial, resubmit }: { assignmentId: string; initial: string; resubmit: boolean }) {
  const router = useRouter();
  const [content, setContent] = useState(initial);
  const { run, pending } = useActionRunner();
  return (
    <div className="grid gap-3">
      <Label htmlFor="answer">Your answer</Label>
      <Textarea id="answer" rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Type your answer, or describe the files you attach." />
      <div>
        <Button disabled={pending} onClick={() => run(() => submitWorkAction({ assignmentId, content }), { onSuccess: () => router.refresh() })}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {resubmit ? "Update submission" : "Submit"}
        </Button>
      </div>
    </div>
  );
}
