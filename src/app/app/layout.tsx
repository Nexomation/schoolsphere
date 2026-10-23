import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, FlaskConical } from "lucide-react";
import { MembershipSwitcher, MobileNav, UserMenu } from "@/components/app-shell/topbar-controls";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { Logo } from "@/components/logo";
import { getAuthContext } from "@/lib/auth/context";
import { unreadCount } from "@/lib/data/notifications";
import { brand, safeAccent } from "@/lib/brand";
import { navigationFor } from "@/lib/navigation";

// Authenticated, per-user pages are always rendered at request time.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!ctx.active) redirect(ctx.isPlatformAdmin ? "/platform" : "/no-access");

  const active = ctx.active;
  const groups = navigationFor(active.role);
  const appName = active.branding.appName?.trim() || brand.appName;
  const accent = safeAccent(active.branding.primaryColor);
  const unread = await unreadCount(ctx.user.id);

  return (
    <div
      className="min-h-screen"
      style={accent ? ({ "--primary": accent, "--ring": accent, "--sidebar-primary": accent } as React.CSSProperties) : undefined}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-14 items-center border-b px-5">
          <Link href="/app">
            <Logo name={appName} />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav groups={groups} />
        </div>
        <div className="border-t px-5 py-3 text-xs text-muted-foreground">{brand.tagline}</div>
      </aside>

      <div className="lg:pl-64">
        {active.isDemo && (
          <div className="no-print flex items-center justify-center gap-2 bg-warning/10 px-4 py-1.5 text-center text-xs font-medium text-warning">
            <FlaskConical className="size-3.5" aria-hidden />
            Demo school — all people, payments and locations here are fictional sample data.
          </div>
        )}
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-card/90 px-3 backdrop-blur sm:px-6">
          <MobileNav groups={groups} appName={appName} />
          <MembershipSwitcher
            memberships={ctx.memberships.map((m) => ({ id: m.id, schoolName: m.schoolName, role: m.role }))}
            activeId={active.id}
          />
          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/app/notifications"
              className="relative flex size-9 items-center justify-center rounded-lg hover:bg-muted"
              aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
            >
              <Bell className="size-4.5" aria-hidden />
              {unread > 0 && (
                <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <UserMenu name={ctx.user.fullName} email={ctx.user.email} isPlatformAdmin={ctx.isPlatformAdmin} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
