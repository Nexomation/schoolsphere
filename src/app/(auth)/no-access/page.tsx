import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutAction } from "@/app/actions/session";

export const metadata: Metadata = { title: "No school access" };

export default function NoAccessPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-xl">Your account is not linked to a school yet</CardTitle>
        <CardDescription>
          Ask your school office to send you an invitation. If you were already invited, open the link from that email to finish joining.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
