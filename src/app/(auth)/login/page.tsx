import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth/context";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { withService } from "@/lib/db";
import { env } from "@/lib/env";
import { DemoAccounts, LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

async function demoAccounts() {
  const config = env();
  if (!config.DEMO_MODE || config.AUTH_PROVIDER !== "local") return null;
  // Development only: list seeded demo accounts so evaluators can sign in with one click.
  const rows = await withService((sql) =>
    sql.many<{ id: string; full_name: string; email: string; role: Role | null; school: string | null }>(
      `select u.id, p.full_name, u.email, m.role, s.name as school
       from auth.users u
       join user_profiles p on p.id = u.id
       left join school_memberships m on m.user_id = u.id
       left join schools s on s.id = m.school_id
       where u.raw_user_meta_data ->> 'demo' = 'true'
       order by s.name nulls first, m.role, u.email`,
    ),
  );
  const groups = new Map<string, { id: string; name: string; email: string; role: string }[]>();
  for (const r of rows) {
    const key = r.school ?? "Platform";
    groups.set(key, [...(groups.get(key) ?? []), { id: r.id, name: r.full_name, email: r.email, role: r.role ? ROLE_LABELS[r.role] : "Platform Super Admin" }]);
  }
  return [...groups.entries()].map(([school, accounts]) => ({ school, accounts }));
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const ctx = await getAuthContext();
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  if (ctx) redirect(ctx.active ? "/app" : ctx.isPlatformAdmin ? "/platform" : "/no-access");
  const demo = await demoAccounts();

  return (
    <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>Use the email address your school registered for you.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} />
          <div className="mt-4 flex justify-between text-sm">
            <Link href="/forgot-password" className="text-primary hover:underline">
              Forgot password?
            </Link>
            <Link href="/#contact" className="text-muted-foreground hover:text-foreground">
              New school? Request a demo
            </Link>
          </div>
        </CardContent>
      </Card>
      {demo && <DemoAccounts groups={demo} />}
    </div>
  );
}
