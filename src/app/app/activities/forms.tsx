"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trophy } from "lucide-react";
import { CheckboxField, FormGrid, SelectField, SubmitButton, TextareaField, TextField } from "@/components/form/fields";
import { useActionForm, useActionRunner } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ACHIEVEMENT_CATEGORIES, ACTIVITY_CATEGORIES, CATEGORY_LABELS, LEVELS, achievementInput, activityInput } from "@/lib/schemas/activities";
import { activityAttendanceAction, addAchievementAction, reviewAchievementAction, saveActivityAction } from "./actions";

type Option = { value: string; label: string };

type Activity = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  coordinator_staff_id: string | null;
  schedule: string | null;
  venue: string | null;
  start_date: string | null;
  end_date: string | null;
  capacity: number | null;
  registration_open: boolean;
  status: string;
};

export function ActivityDialog({ activity, staff, canAssignCoordinator }: { activity?: Activity; staff: Option[]; canAssignCoordinator: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: activityInput,
    defaultValues: {
      id: activity?.id ?? "",
      name: activity?.name ?? "",
      category: (activity?.category ?? "sports") as "sports",
      description: activity?.description ?? "",
      coordinatorStaffId: activity?.coordinator_staff_id ?? "",
      schedule: activity?.schedule ?? "",
      venue: activity?.venue ?? "",
      startDate: activity?.start_date ?? "",
      endDate: activity?.end_date ?? "",
      capacity: activity?.capacity === null || activity?.capacity === undefined ? "" : String(activity.capacity),
      registrationOpen: activity?.registration_open ?? true,
      status: (activity?.status ?? "active") as "active",
    },
    action: saveActivityAction,
    resetOnSuccess: !activity,
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {activity ? (
          <Button size="sm" variant="outline">
            <Pencil aria-hidden /> Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus aria-hidden /> New activity
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{activity ? `Edit ${activity.name}` : "New activity"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormGrid>
            <TextField control={form.control} name="name" label="Name" required />
            <SelectField control={form.control} name="category" label="Category" options={ACTIVITY_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} />
            <SelectField control={form.control} name="coordinatorStaffId" label="Coordinator" options={staff} allowNone noneLabel="None" disabled={!canAssignCoordinator} />
            <TextField control={form.control} name="schedule" label="Schedule" placeholder="Tue & Thu, 3:45–5:00 pm" />
            <TextField control={form.control} name="venue" label="Venue" />
            <TextField control={form.control} name="capacity" label="Capacity" type="number" />
            <TextField control={form.control} name="startDate" label="Starts" type="date" />
            <TextField control={form.control} name="endDate" label="Ends" type="date" />
          </FormGrid>
          <TextareaField control={form.control} name="description" label="Description" rows={3} />
          <CheckboxField control={form.control} name="registrationOpen" label="Families can register their children" />
          {activity && (
            <SelectField control={form.control} name="status" label="Status" options={[{ value: "active", label: "Active" }, { value: "completed", label: "Completed" }, { value: "cancelled", label: "Cancelled" }]} />
          )}
          <SubmitButton pending={pending} size="default">
            Save activity
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SessionAttendance({ activityId, members, today }: { activityId: string; members: { student_id: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [present, setPresent] = useState<Set<string>>(() => new Set(members.map((m) => m.student_id)));
  const { run, pending } = useActionRunner();
  return (
    <div className="grid gap-3">
      <div className="flex items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor="session-date">Session date</Label>
          <Input id="session-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-44" />
        </div>
        <span className="pb-2 text-sm text-muted-foreground">
          {present.size} of {members.length} present
        </span>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {members.map((m) => (
          <label key={m.student_id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
            <Checkbox
              checked={present.has(m.student_id)}
              onCheckedChange={(v) =>
                setPresent((s) => {
                  const n = new Set(s);
                  if (v === true) n.add(m.student_id);
                  else n.delete(m.student_id);
                  return n;
                })
              }
            />
            {m.name}
          </label>
        ))}
      </div>
      <Button
        className="w-fit"
        disabled={pending || members.length === 0}
        onClick={() => run(() => activityAttendanceAction({ activityId, sessionDate: date, entries: members.map((m) => ({ studentId: m.student_id, present: present.has(m.student_id) })) }), { onSuccess: () => router.refresh() })}
      >
        Save session
      </Button>
    </div>
  );
}

export function AchievementDialog({ students, activities, today, triggerLabel = "Record achievement", defaultStudentId }: { students: Option[]; activities: Option[]; today: string; triggerLabel?: string; defaultStudentId?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: achievementInput,
    defaultValues: { studentId: defaultStudentId ?? "", activityId: "", category: "competitions", title: "", description: "", level: "school", position: "", achievedOn: today },
    action: addAchievementAction,
    resetOnSuccess: true,
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Trophy aria-hidden /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{triggerLabel}</DialogTitle>
          <DialogDescription>Attach the certificate after saving. Achievements submitted by families are checked by the school before they appear on reports.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormGrid>
            <SelectField control={form.control} name="studentId" label="Student" options={students} required />
            <SelectField control={form.control} name="activityId" label="Related activity" options={activities} allowNone noneLabel="None" />
            <SelectField control={form.control} name="category" label="Category" options={ACHIEVEMENT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} />
            <SelectField control={form.control} name="level" label="Level" options={LEVELS.map((l) => ({ value: l, label: l[0].toUpperCase() + l.slice(1) }))} />
            <TextField control={form.control} name="position" label="Position / award" placeholder="1st, Gold, Merit…" />
            <TextField control={form.control} name="achievedOn" label="Date" type="date" required />
          </FormGrid>
          <TextField control={form.control} name="title" label="Title" required placeholder="District-level science quiz" />
          <TextareaField control={form.control} name="description" label="Details" rows={2} />
          <SubmitButton pending={pending} size="default">
            Save
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewButtons({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const { run, pending } = useActionRunner();
  return (
    <div className="grid gap-2 sm:w-72">
      <Textarea rows={2} placeholder="Note to the family (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Review note" />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => reviewAchievementAction(id, "verified", note), { onSuccess: () => router.refresh() })}>
          Verify
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reviewAchievementAction(id, "rejected", note), { onSuccess: () => router.refresh() })}>
          Reject
        </Button>
      </div>
    </div>
  );
}
