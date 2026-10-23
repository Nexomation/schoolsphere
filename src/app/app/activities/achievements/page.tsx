import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Clock } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { FileList, FileUploader } from "@/components/files";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, humanize } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listAchievements, listActivities } from "@/lib/data/activities";
import { filesFor } from "@/lib/data/homework";
import { currentYear, familyChildren, schoolToday } from "@/lib/data/school";
import { formatDate } from "@/lib/domain/dates";
import { CATEGORY_LABELS } from "@/lib/schemas/activities";
import { deleteFileAction } from "../../homework/actions";
import { AchievementDialog, ReviewButtons } from "../forms";

export const metadata: Metadata = { title: "Achievements" };

export default async function AchievementsPage({ searchParams }: PageProps<"/app/activities/achievements">) {
  const ctx = await requirePageContext("activities.view");
  const sp = await searchParams;
  const verifier = can(ctx.role, "achievements.verify");
  const canSubmit = can(ctx.role, "achievements.submit");
  const d = await ctx.db(async (sql) => {
    const year = await currentYear(sql, ctx.schoolId);
    const rows = await listAchievements(sql, ctx.schoolId);
    const students =
      ctx.role === "parent"
        ? (await familyChildren(sql, ctx.schoolId)).map((c) => ({ id: c.id, name: c.full_name, section_label: c.section_label }))
        : await sql.many<{ id: string; name: string; section_label: string | null }>(
            `select s.id, trim(s.first_name || ' ' || s.last_name) as name, c.name || ' ' || sec.name as section_label
             from students s left join enrollments e on e.student_id = s.id and e.status = 'active'
             left join sections sec on sec.id = e.section_id left join classes c on c.id = sec.class_id
             where s.school_id = $1 and s.status = 'active' order by s.first_name`,
            [ctx.schoolId],
          );
    return {
      rows,
      students,
      activities: await listActivities(sql, ctx.schoolId, year.id, ctx.userId),
      today: await schoolToday(sql, ctx.schoolId),
      files: await filesFor(sql, "achievement", rows.map((r) => r.id)),
    };
  });
  const pending = d.rows.filter((r) => r.status === "pending");
  const fileItems = (id: string) => d.files.filter((f) => f.entity_id === id).map((f) => ({ ...f, mine: true }));

  return (
    <>
      <PageHeader
        title="Achievements"
        description={verifier ? "Record achievements and verify certificates submitted by families." : "Awards and recognitions. Submissions are verified by the school before they appear on reports."}
        actions={
          canSubmit && (
            <AchievementDialog
              students={d.students.map((s) => ({ value: s.id, label: `${s.name}${s.section_label ? ` (${s.section_label})` : ""}` }))}
              activities={d.activities.map((a) => ({ value: a.id, label: a.name }))}
              today={d.today}
              triggerLabel={verifier ? "Record achievement" : "Submit an achievement"}
            />
          )
        }
      />
      {verifier && pending.length > 0 && (
        <Card className="mb-6 border-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4 text-warning" aria-hidden /> Awaiting verification ({pending.length})
            </CardTitle>
            <CardDescription>Check the certificate before verifying.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {pending.map((a) => (
              <div key={a.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:justify-between">
                <div className="grid gap-1 text-sm">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-muted-foreground">
                    {a.student_name} · {a.section_label} · {humanize(a.level)} level{a.position ? ` · ${a.position}` : ""} · {formatDate(a.achieved_on)}
                  </p>
                  {a.description && <p>{a.description}</p>}
                  <p className="text-xs text-muted-foreground">Submitted by {a.submitted_by_name ?? "—"}</p>
                  <FileList files={fileItems(a.id)} />
                  {fileItems(a.id).length === 0 && <p className="text-xs text-warning">No certificate attached.</p>}
                </div>
                <ReviewButtons id={a.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <DataTable
        rows={d.rows}
        rowKey={(r) => r.id}
        searchParams={sp}
        search={{ placeholder: "Search achievements or students", text: (r) => `${r.title} ${r.student_name} ${r.activity_name ?? ""}` }}
        filters={[
          { param: "status", label: "Status", options: ["verified", "pending", "rejected"].map((s) => ({ value: s, label: humanize(s) })), match: (r, v) => r.status === v },
          { param: "level", label: "Level", options: ["school", "zonal", "district", "state", "national", "international"].map((s) => ({ value: s, label: humanize(s) })), match: (r, v) => r.level === v },
        ]}
        empty={{ title: "No achievements recorded yet" }}
        columns={[
          {
            key: "title",
            header: "Achievement",
            cell: (r) => (
              <span>
                <span className="font-medium">{r.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {CATEGORY_LABELS[r.category]}
                  {r.position && ` · ${r.position}`}
                  {r.activity_name && ` · ${r.activity_name}`}
                </span>
                {r.status === "pending" || verifier ? (
                  <span className="mt-1 block">
                    <FileUploader
                      entity="achievement"
                      entityId={r.id}
                      files={fileItems(r.id)}
                      label="Attach certificate"
                      removeAction={async (fid) => {
                        "use server";
                        return deleteFileAction(fid, "/app/activities/achievements");
                      }}
                    />
                  </span>
                ) : (
                  <FileList files={fileItems(r.id)} />
                )}
              </span>
            ),
          },
          {
            key: "student",
            header: "Student",
            sort: (r) => r.student_name,
            cell: (r) => (
              <Link href={`/app/activities/portfolio/${r.student_id}`} className="hover:text-primary hover:underline">
                {r.student_name}
                <span className="block text-xs text-muted-foreground">{r.section_label}</span>
              </Link>
            ),
          },
          { key: "level", header: "Level", sort: (r) => r.level, cell: (r) => humanize(r.level), hideBelow: "md" },
          { key: "date", header: "Date", sort: (r) => r.achieved_on, cell: (r) => formatDate(r.achieved_on), hideBelow: "sm" },
          {
            key: "status",
            header: "Status",
            cell: (r) =>
              r.status === "verified" ? (
                <span className="inline-flex items-center gap-1 text-xs text-success">
                  <BadgeCheck className="size-3.5" aria-hidden /> Verified
                </span>
              ) : (
                <StatusBadge status={r.status} />
              ),
          },
        ]}
        defaultSort={{ key: "date", dir: "desc" }}
      />
    </>
  );
}
