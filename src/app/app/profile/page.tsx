import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { ChangePasswordForm, MyProfileForm } from "./forms";

export const metadata: Metadata = { title: "Profile & security" };

export default async function ProfilePage() {
  const ctx = await requirePageContext();
  const profile = await ctx.db((sql) =>
    sql.one<{ full_name: string; phone: string | null; preferred_language: "en" | "ta"; email: string }>(
      "select full_name, phone, preferred_language, email from user_profiles where id = $1",
      [ctx.userId],
    ),
  );
  return (
    <>
      <PageHeader title="Profile & security" description={profile.email} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
          </CardHeader>
          <CardContent>
            <MyProfileForm profile={profile} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>At least 10 characters, including a letter and a number.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your access</CardTitle>
            <CardDescription>Switch between these from the menu at the top.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {ctx.memberships.map((m) => (
                <li key={m.id} className="rounded-md border px-3 py-2">
                  <span className="font-medium">{m.schoolName}</span>
                  <span className="block text-muted-foreground">{ROLE_LABELS[m.role]}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
