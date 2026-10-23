"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/**
 * A button that asks for confirmation (and optionally a reason, which is
 * stored in the audit log) before running a server action.
 */
export function ConfirmAction({
  action,
  title,
  description,
  confirmLabel = "Confirm",
  triggerLabel,
  trigger,
  variant = "default",
  triggerVariant = "outline",
  triggerSize = "sm",
  requireReason,
  reasonLabel = "Reason",
  redirectTo,
}: {
  action: (reason: string) => Promise<Result>;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  triggerLabel?: string;
  trigger?: React.ReactNode;
  variant?: "default" | "destructive";
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  requireReason?: boolean;
  reasonLabel?: string;
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const reasonMissing = requireReason && reason.trim().length < 3;

  const confirm = () =>
    start(async () => {
      try {
        const res = await action(reason.trim());
        if (res.ok) {
          toast.success(res.message ?? "Done");
          setOpen(false);
          setReason("");
          if (redirectTo) router.push(redirectTo);
          else router.refresh();
        } else toast.error(res.error);
      } catch {
        toast.error("Could not reach the server. Try again.");
      }
    });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button variant={triggerVariant} size={triggerSize}>
            {triggerLabel ?? confirmLabel}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {requireReason && (
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-reason">{reasonLabel}</Label>
            <Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            <p className="text-xs text-muted-foreground">Recorded in the audit log.</p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant={variant} onClick={confirm} disabled={pending || reasonMissing}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
