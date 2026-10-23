"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useActionRunner } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { enrollAction } from "../actions";

export function EnrollPicker({ activityId, students }: { activityId: string; students: { value: string; label: string }[] }) {
  const router = useRouter();
  const [student, setStudent] = useState("");
  const { run, pending } = useActionRunner();
  return (
    <div className="flex gap-2">
      <Select value={student} onValueChange={setStudent}>
        <SelectTrigger className="h-9 w-full" aria-label="Student to add">
          <SelectValue placeholder="Add a student…" />
        </SelectTrigger>
        <SelectContent>
          {students.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        disabled={!student || pending}
        onClick={() =>
          run(() => enrollAction(activityId, student), {
            onSuccess: () => {
              setStudent("");
              router.refresh();
            },
          })
        }
      >
        Add
      </Button>
    </div>
  );
}
