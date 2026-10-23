"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useActionRunner } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { approveRemarkAction, saveRemarkAction } from "../../actions";

export function RemarkEditor({
  examinationId,
  studentId,
  initial,
  source,
  approved,
}: {
  examinationId: string;
  studentId: string;
  initial: string;
  source: "human" | "ai_draft" | null;
  approved: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const { run, pending } = useActionRunner();
  return (
    <div className="no-print grid gap-2">
      {source === "ai_draft" && !approved && (
        <p className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-1 text-xs text-warning">
          <Sparkles className="size-3.5" aria-hidden /> AI-generated draft — not visible to the family until a teacher reviews and approves it.
        </p>
      )}
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Class teacher remark" placeholder="Write the class teacher's remark for this examination" />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || text.trim().length < 2} onClick={() => run(() => saveRemarkAction({ examinationId, studentId, remark: text }), { onSuccess: () => router.refresh() })}>
          Save remark
        </Button>
        {source === "ai_draft" && !approved && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => approveRemarkAction(examinationId, studentId), { onSuccess: () => router.refresh() })}>
            Approve draft as written
          </Button>
        )}
      </div>
    </div>
  );
}
