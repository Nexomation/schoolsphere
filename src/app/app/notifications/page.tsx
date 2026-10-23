import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { listNotifications, NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPES } from "@/lib/data/notifications";
import { relativeTime } from "@/lib/domain/dates";
import { channelStatus } from "@/lib/notifications/channels";
import { cn } from "@/lib/utils";
import { MarkAllRead, NotificationLink, PreferencesForm } from "./client";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: PageProps<"/app/notifications">) {
  const ctx = await requirePageContext("dashboard.view");
  const sp = await searchParams;
  const filter = sp.filter === "unread" ? "unread" : "all";
  const d = await ctx.db(async (sql) => ({
    rows: await listNotifications(sql, ctx.userId, filter),
    unread: (await sql.one<{ n: number }>("select count(*)::int as n from notifications where user_id = $1 and read_at is null", [ctx.userId])).n,
    prefs: await sql.many<{ type: string; in_app: boolean; email: boolean; push: boolean; whatsapp: boolean }>("select type, in_app, email, push, whatsapp from notification_preferences where user_id = $1", [ctx.userId]),
  }));
  const channels = channelStatus();
  const prefs = NOTIFICATION_TYPES.map((t) => {
    const p = d.prefs.find((x) => x.type === t);
    return { type: t, label: NOTIFICATION_TYPE_LABELS[t], inApp: p?.in_app ?? true, email: p?.email ?? false, push: p?.push ?? false, whatsapp: p?.whatsapp ?? false };
  });

  return (
    <>
      <PageHeader title="Notifications" description={`${d.unread} unread`} actions={<MarkAllRead disabled={d.unread === 0} />} />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center gap-3">
            {(["all", "unread"] as const).map((f) => (
              <Link key={f} href={f === "all" ? "?" : "?filter=unread"} className={cn("rounded-md px-2.5 py-1 text-sm", filter === f ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                {f === "all" ? "All" : "Unread"}
              </Link>
            ))}
          </CardHeader>
          <CardContent className="px-3">
            {d.rows.length === 0 ? (
              <EmptyState icon={Bell} title={filter === "unread" ? "You're all caught up" : "No notifications yet"} className="border-0" />
            ) : (
              <ul className="grid gap-1">
                {d.rows.map((n) => (
                  <li key={n.id}>
                    <NotificationLink id={n.id} href={n.link} unread={!n.read_at}>
                      <div className="flex items-start gap-3">
                        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} aria-label={n.read_at ? undefined : "Unread"} />
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-sm", !n.read_at && "font-semibold")}>{n.title}</p>
                          {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <StatusBadge status={n.type} tone="neutral" label={NOTIFICATION_TYPE_LABELS[n.type]} /> {relativeTime(n.created_at)}
                          </p>
                        </div>
                      </div>
                    </NotificationLink>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="h-fit lg:col-span-2">
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>
              In-app notifications always work.{" "}
              {channels.some((c) => c.sendingEnabled)
                ? "Email/WhatsApp are sent only for the types you switch on."
                : "Email, push and WhatsApp delivery are not configured for this installation yet, so only in-app notifications are delivered. Your choices are saved for when they are enabled."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PreferencesForm initial={prefs} channels={channels} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
