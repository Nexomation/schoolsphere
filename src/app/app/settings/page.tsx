import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { schoolProfile } from "@/lib/data/school";
import { BrandingForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requirePageContext("settings.manage");
  const p = await ctx.db((sql) => schoolProfile(sql, ctx.schoolId));
  return (
    <>
      <PageHeader title="School profile" description="Shown on receipts, report cards and the app header." />
      {!p.onboarding_completed_at && (
        <p className="mb-6 rounded-lg bg-info/10 p-3 text-sm text-info">
          Setup is not finished. <Link href="/app/setup" className="font-medium underline">Continue the setup wizard</Link>.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={p} />
          </CardContent>
        </Card>
        <Card className="h-fit lg:col-span-2">
          <CardHeader>
            <CardTitle>Branding</CardTitle>
            <CardDescription>Your school&apos;s name and colour inside the app.</CardDescription>
          </CardHeader>
          <CardContent>
            <BrandingForm branding={p.branding} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
