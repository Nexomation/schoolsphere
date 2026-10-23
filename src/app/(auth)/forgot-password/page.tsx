import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/env";
import { ForgotPasswordForm } from "./form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  const local = env().AUTH_PROVIDER === "local";
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-xl">Reset your password</CardTitle>
        <CardDescription>We will send a reset link to your email address.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ForgotPasswordForm />
        {local && (
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Local development mode: no email provider is configured, so the reset link is written to the server console instead of being emailed.
          </p>
        )}
        <Link href="/login" className="text-sm text-primary hover:underline">
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
