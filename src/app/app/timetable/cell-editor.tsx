"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { FormGrid, SelectField, SubmitButton, TextField } from "@/components/form/fields";
import { useActionForm, useActionRunner } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { timetableEntryInput } from "@/lib/schemas/academics";
import { deleteTimetableEntryAction, saveTimetableEntryAction } from "../academics/actions";

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Cell = { id: string; subjectId: string | null; staffId: string | null; startTime: string; endTime: string; subjectName: string | null; staffName: string | null; room: string | null };

export function CellEditor({
  sectionId,
  day,
  period,
  cell,
  defaultTimes,
  subjects,
  staff,
}: {
  sectionId: string;
  day: number;
  period: number;
  cell: Cell | null;
  defaultTimes: { start: string; end: string } | null;
  subjects: { value: string; label: string }[];
  staff: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { run, pending: clearing } = useActionRunner();
  const { form, onSubmit, pending } = useActionForm({
    schema: timetableEntryInput,
    defaultValues: {
      sectionId,
      dayOfWeek: day,
      periodNo: period,
      startTime: cell?.startTime ?? defaultTimes?.start ?? "09:00",
      endTime: cell?.endTime ?? defaultTimes?.end ?? "09:45",
      subjectId: cell?.subjectId ?? "",
      staffId: cell?.staffId ?? "",
      room: cell?.room ?? "",
    },
    action: saveTimetableEntryAction,
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="w-full rounded-md p-1 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          {cell ? (
            <>
              <span className="block font-medium">{cell.subjectName ?? "Free"}</span>
              <span className="block text-xs text-muted-foreground">{cell.staffName ?? ""}</span>
            </>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Plus className="size-3" aria-hidden /> Add
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {DAY_NAMES[day]}, period {period}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormGrid>
            <SelectField control={form.control} name="subjectId" label="Subject" options={subjects} allowNone noneLabel="Free period" />
            <SelectField control={form.control} name="staffId" label="Teacher" options={staff} allowNone noneLabel="No teacher" />
            <TextField control={form.control} name="startTime" label="Starts" type="time" />
            <TextField control={form.control} name="endTime" label="Ends" type="time" />
            <TextField control={form.control} name="room" label="Room" />
          </FormGrid>
          <div className="flex justify-between gap-2">
            {cell ? (
              <Button
                type="button"
                variant="destructive"
                disabled={clearing}
                onClick={() => run(() => deleteTimetableEntryAction(cell.id), { onSuccess: () => { setOpen(false); router.refresh(); } })}
              >
                Clear period
              </Button>
            ) : (
              <span />
            )}
            <SubmitButton pending={pending} size="default">
              Save
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
