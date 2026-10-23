import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth/context";
import { PASSWORD_RULES } from "@/lib/auth/password";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { previewInvitation } from "@/lib/data/invitations";
import { AcceptAsCurrentUser, AcceptInviteForm } from "./form";

export const metadata: Metadata = { title: "Accept invitation", robots: { index: false } };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invite = await previewInvitation(token);
  const ctx = await getAuthContext();

  if (!invite || !invite.usable) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CircleAlert className="size-5 text-destructive" aria-hidden /> Invitation unavailable
          </CardTitle>
          <CardDescription>
            {invite?.expired ? "This invitation has expired." : "This invitation link is invalid or has already been used."} Please ask your
            school office to send a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/login">Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-xl">Join {invite.schoolName}</CardTitle>
        <CardDescription>
          You have been invited as <strong>{ROLE_LABELS[invite.role]}</strong> using <strong>{invite.email}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {ctx ? (
          ctx.user.email.toLowerCase() === invite.email.toLowerCase() ? (
            <AcceptAsCurrentUser token={token} />
          ) : (
            <p className="text-sm text-muted-foreground">
              You are signed in as {ctx.user.email}. Sign out and open this link again to accept the invitation for {invite.email}.
            </p>
          )
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">Create your password to finish setting up your account. {PASSWORD_RULES}</p>
            <AcceptInviteForm token={token} defaultName={invite.fullName} />
            <p className="mt-4 text-xs text-muted-foreground">
              Already have an account with this email?{" "}
              <Link href={`/login?next=/invite/${token}`} className="text-primary hover:underline">
                Sign in first
              </Link>
              .
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
