"use client";

import { BellRing } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { sendFeeRemindersAction } from "../actions";

export function RemindButton({ count }: { count: number }) {
  return (
    <ConfirmAction
      action={() => sendFeeRemindersAction()}
      title={`Send reminders to ${count} famil${count === 1 ? "y" : "ies"}?`}
      description="Parents with overdue fees receive an in-app notification (and email/WhatsApp if configured and they opted in)."
      confirmLabel="Send reminders"
      trigger={
        <Button size="sm" disabled={count === 0}>
          <BellRing aria-hidden /> Remind overdue ({count})
        </Button>
      }
    />
  );
}
