import type { Metadata } from "next";
import Link from "next/link";
import { UserMenu } from "@/components/app-shell/topbar-controls";
import { Logo } from "@/components/logo";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { brand } from "@/lib/brand";

export const metadata: Metadata = { title: "Platform console" };

// Authenticated, per-user pages are always rendered at request time.
export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: LayoutProps<"/platform">) {
  const ctx = await requirePlatformAdmin();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur sm:px-6">
        <Link href="/platform">
          <Logo name={brand.appName} />
        </Link>
        <span className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Platform console</span>
        <div className="ml-auto flex items-center gap-2">
          {ctx.active && (
            <Link href="/app" className="text-sm text-muted-foreground hover:text-foreground">
              Open school app
            </Link>
          )}
          <UserMenu name={ctx.user.fullName} email={ctx.user.email} isPlatformAdmin />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
