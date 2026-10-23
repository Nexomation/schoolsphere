"use client";

import { useRouter } from "next/navigation";
import { Sun, Sunset } from "lucide-react";
import { useActionRunner } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { startTripAction } from "../transport/actions";

export function StartTripButtons({ routeId }: { routeId: string }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button size="lg" className="h-12" disabled={pending} onClick={() => run(() => startTripAction(routeId, "pickup"), { onSuccess: () => router.refresh() })}>
        <Sun aria-hidden /> Start morning pickup
      </Button>
      <Button size="lg" variant="outline" className="h-12" disabled={pending} onClick={() => run(() => startTripAction(routeId, "drop"), { onSuccess: () => router.refresh() })}>
        <Sunset aria-hidden /> Start afternoon drop
      </Button>
    </div>
  );
}
