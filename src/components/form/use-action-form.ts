"use client";

import { useTransition } from "react";
import { useForm, type DefaultValues, type FieldValues, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";

type Result<T> = { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * React Hook Form + Zod on the client, with the same schema re-validated by
 * the server action. The client schema only gates submission: the action
 * receives the raw form values (not the transformed output), because the
 * server parses them again with the same schema and transforms are not
 * idempotent (for example "" becomes null). Server field errors are mapped
 * back onto the inputs.
 */
export function useActionForm<S extends z.ZodType<FieldValues, FieldValues>, R = unknown>({
  schema,
  defaultValues,
  action,
  onSuccess,
  resetOnSuccess = false,
  successMessage,
}: {
  schema: S;
  defaultValues: DefaultValues<z.input<S>>;
  action: (values: z.input<S>) => Promise<Result<R>>;
  onSuccess?: (data: R) => void;
  resetOnSuccess?: boolean;
  successMessage?: string;
}) {
  const form = useForm<z.input<S>, unknown, z.output<S>>({
    resolver: zodResolver(schema as never),
    defaultValues,
    mode: "onTouched",
  });
  const [pending, startTransition] = useTransition();

  const onSubmit = form.handleSubmit(() =>
    new Promise<void>((resolve) => {
      startTransition(async () => {
        try {
          const res = await action(form.getValues());
          if (res.ok) {
            toast.success(res.message ?? successMessage ?? "Saved");
            if (resetOnSuccess) form.reset();
            onSuccess?.(res.data);
          } else {
            toast.error(res.error);
            for (const [name, message] of Object.entries(res.fieldErrors ?? {})) {
              form.setError(name as Path<z.input<S>>, { message });
            }
          }
        } catch {
          toast.error("Could not reach the server. Check your connection and try again.");
        } finally {
          resolve();
        }
      });
    }),
  );

  return { form, onSubmit, pending };
}

/** Runs a server action from a button with toast feedback. */
export function useActionRunner() {
  const [pending, startTransition] = useTransition();
  const run = <R,>(fn: () => Promise<Result<R>>, opts: { onSuccess?: (data: R) => void; successMessage?: string } = {}) =>
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          toast.success(res.message ?? opts.successMessage ?? "Done");
          opts.onSuccess?.(res.data);
        } else toast.error(res.error);
      } catch {
        toast.error("Could not reach the server. Check your connection and try again.");
      }
    });
  return { run, pending };
}
