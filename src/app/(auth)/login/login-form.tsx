"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { demoSignInAction, signInAction } from "../actions";
import { SubmitButton, TextField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema,
    defaultValues: { email: "", password: "" },
    action: (v) => signInAction({ ...v, next }),
    onSuccess: (data) => {
      router.push(data.redirectTo);
      router.refresh();
    },
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" required />
      <TextField control={form.control} name="password" label="Password" type="password" autoComplete="current-password" required />
      <SubmitButton pending={pending} className="w-full">
        <LogIn aria-hidden /> Sign in
      </SubmitButton>
    </form>
  );
}

type DemoGroup = { school: string; accounts: { id: string; name: string; email: string; role: string }[] };

export function DemoAccounts({ groups }: { groups: DemoGroup[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);
  const signIn = (id: string) =>
    start(async () => {
      setChosen(id);
      const res = await demoSignInAction(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(res.data.redirectTo);
      router.refresh();
    });

  return (
    <Card className="w-full border-warning/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="size-4 text-warning" aria-hidden /> Demo accounts
          <span className="rounded bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning">development only</span>
        </CardTitle>
        <CardDescription>
          DEMO_MODE is on, so you can sign in to any seeded account with one click. All schools, people and payments are fictional.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {groups.map((g) => (
          <div key={g.school}>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.school}</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {g.accounts.map((a) => (
                <Button
                  key={a.id}
                  variant="outline"
                  className="h-auto justify-start py-2 text-left"
                  disabled={pending}
                  onClick={() => signIn(a.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{a.role}</span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">{a.name}</span>
                  </span>
                  {pending && chosen === a.id && <Loader2 className="ml-auto animate-spin" aria-hidden />}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
