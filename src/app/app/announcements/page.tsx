import type { Metadata } from "next";
import { Megaphone, Sparkles } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listAnnouncements } from "@/lib/data/announcements";
import { currentYear, sectionsOfYear, teachingSections } from "@/lib/data/school";
import { formatDateTime } from "@/lib/domain/dates";
import { archiveAnnouncementAction, publishAnnouncementAction } from "./actions";
import { AnnouncementForm } from "./announcement-form";

export const metadata: Metadata = { title: "Announcements" };

const AUDIENCE: Record<string, string> = { all: "Everyone", staff: "Staff", parents: "Parents", students: "Students", section: "Section" };

export default async function AnnouncementsPage() {
  const ctx = await requirePageContext("announcements.view");
  const publisher = can(ctx.role, "announcements.publish");
  const d = await ctx.db(async (sql) => {
    const rows = await listAnnouncements(sql, ctx.schoolId);
    let sections: { value: string; label: string }[] = [];
    if (publisher) {
      const year = await currentYear(sql, ctx.schoolId);
      sections = (ctx.role === "teacher" ? await teachingSections(sql, ctx.schoolId, ctx.userId, year.id) : await sectionsOfYear(sql, ctx.schoolId, year.id)).map((s) => ({ value: s.id, label: s.label }));
    }
    return { rows, sections };
  });

  return (
    <>
      <PageHeader title="Announcements" description="Circulars and notices from the school." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-4 lg:col-span-2">
          {d.rows.length === 0 && <EmptyState icon={Megaphone} title="No announcements yet" />}
          {d.rows.map((a) => (
            <Card key={a.id} className={a.priority === "urgent" ? "border-destructive/50" : a.priority === "important" ? "border-warning/50" : undefined}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{a.title}</CardTitle>
                  {a.priority !== "normal" && <StatusBadge status={a.priority} tone={a.priority === "urgent" ? "danger" : "warning"} />}
                  {a.status === "draft" && <StatusBadge status="draft" />}
                </div>
                <p className="text-xs text-muted-foreground">
                  {a.author ?? "School office"} · {a.published_at ? formatDateTime(a.published_at) : "not published"} · {AUDIENCE[a.audience]}
                  {a.section_label && `: ${a.section_label}`}
                  {a.is_ai_assisted && (
                    <span className="ml-1 inline-flex items-center gap-0.5">
                      · <Sparkles className="size-3" aria-hidden /> AI-assisted draft, reviewed by author
                    </span>
                  )}
                </p>
              </CardHeader>
              <CardContent className="grid gap-3">
                <p className="text-sm whitespace-pre-wrap">{a.body}</p>
                {publisher && (ctx.role === "school_admin" || a.created_by === ctx.userId) && (
                  <div className="flex gap-2">
                    {a.status === "draft" && <ConfirmAction action={publishAnnouncementAction.bind(null, a.id)} title="Publish this announcement?" description="The audience will be notified." confirmLabel="Publish" triggerVariant="default" />}
                    <ConfirmAction action={archiveAnnouncementAction.bind(null, a.id)} title="Archive this announcement?" description="It will be hidden from everyone." confirmLabel="Archive" triggerVariant="ghost" />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        {publisher && (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>New announcement</CardTitle>
            </CardHeader>
            <CardContent>
              <AnnouncementForm sections={d.sections} teacherOnly={ctx.role === "teacher"} />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
