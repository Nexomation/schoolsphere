import type { Metadata } from "next";
import { AlertTriangle, History } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UrlPicker } from "@/components/url-controls";
import { UrlDateInput } from "@/components/url-date-input";
import { requirePageContext } from "@/lib/auth/context";
import { attendanceCorrections, dayStatus, sectionRoster } from "@/lib/data/attendance";
import { currentYear, schoolProfile, schoolToday, sectionsOfYear, subjectsOf, teachingSections } from "@/lib/data/school";
import { addDays, formatDate, formatDateTime } from "@/lib/domain/dates";
import { AttendanceRegister } from "../register";

export const metadata: Metadata = { title: "Mark attendance" };

const DAILY = "daily";

export default async function MarkAttendancePage({ searchParams }: PageProps<"/app/attendance/mark">) {
  const ctx = await requirePageContext("attendance.mark");
  const sp = await searchParams;

  const d = await ctx.db(async (sql) => {
    const year = await currentYear(sql, ctx.schoolId);
    const today = await schoolToday(sql, ctx.schoolId);
    const profile = await schoolProfile(sql, ctx.schoolId);
    const allSubjects = (await subjectsOf(sql, ctx.schoolId)).filter((s) => s.is_active);
    const sections =
      ctx.role === "teacher"
        ? (await teachingSections(sql, ctx.schoolId, ctx.userId, year.id)).map((s) => ({ id: s.id, label: s.label, subjects: s.subjects, isClassTeacher: s.isClassTeacher }))
        : (await sectionsOfYear(sql, ctx.schoolId, year.id)).map((s) => ({ id: s.id, label: s.label, subjects: allSubjects, isClassTeacher: true }));
    const section = sections.find((s) => s.id === sp.section) ?? sections[0];
    const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
    const subjectParam = typeof sp.subject === "string" ? sp.subject : DAILY;
    const subject = section?.subjects.find((s) => s.id === subjectParam) ?? null;
    if (!section) return { sections, today };
    return {
      sections,
      section,
      today,
      date,
      subject,
      window: Number((profile.settings as { attendanceEditWindowDays?: number }).attendanceEditWindowDays ?? 7),
      status: await dayStatus(sql, ctx.schoolId, date),
      roster: await sectionRoster(sql, section.id, date, subject?.id ?? null),
      corrections: ctx.role === "school_admin" ? await attendanceCorrections(sql, section.id, date) : [],
    };
  });

  if (!("section" in d) || !d.section) {
    return (
      <>
        <PageHeader title="Mark attendance" back={{ href: "/app/attendance", label: "Attendance" }} />
        <EmptyState title="No sections assigned" description="You need a class-teacher or subject assignment to mark attendance." />
      </>
    );
  }

  const tooOld = ctx.role !== "school_admin" && d.date! < addDays(d.today, -d.window!);
  const lastSaved = d.roster!.map((r) => r.updated_at).filter(Boolean).sort().at(-1);
  // Daily register is for class teachers (and admins); subject teachers mark subject-wise attendance.
  const canDaily = d.section.isClassTeacher;
  const subjectOptions = [
    ...(canDaily ? [{ value: DAILY, label: "Daily attendance (homeroom)" }] : []),
    ...d.section.subjects.map((s) => ({ value: s.id, label: `${s.name} period` })),
  ];
  const effectiveSubject = !canDaily && !d.subject ? d.section.subjects[0] ?? null : d.subject;

  return (
    <>
      <PageHeader
        title={`${d.section.label} — ${formatDate(d.date)}`}
        description={effectiveSubject ? `${effectiveSubject.name} period attendance` : "Daily attendance (used for attendance percentages)"}
        back={{ href: "/app/attendance", label: "Attendance" }}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Section</span>
          <UrlPicker param="section" label="Section" value={d.section.id} options={d.sections.map((s) => ({ value: s.id, label: s.label }))} />
        </div>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Register</span>
          <UrlPicker param="subject" label="Register" value={effectiveSubject?.id ?? DAILY} options={subjectOptions} />
        </div>
        <UrlDateInput param="date" value={d.date!} label="Date" max={d.today} />
      </div>

      {!d.status!.isWorkingDay && (
        <Alert className="mb-4">
          <AlertTriangle aria-hidden />
          <AlertTitle>{d.status!.holiday ? `Holiday: ${d.status!.holiday}` : "Not a regular working day"}</AlertTitle>
          <AlertDescription>
            {d.status!.holiday
              ? "Attendance recorded on a declared holiday is ignored in attendance percentages."
              : "If school was held today (for example a special Saturday), you can still record attendance and it will count."}
          </AlertDescription>
        </Alert>
      )}
      {tooOld && (
        <Alert className="mb-4">
          <AlertTitle>Read only</AlertTitle>
          <AlertDescription>Attendance older than {d.window} days can only be corrected by a school administrator.</AlertDescription>
        </Alert>
      )}

      {d.roster!.length === 0 ? (
        <EmptyState title="No active students in this section" />
      ) : (
        <AttendanceRegister
          key={`${d.section.id}-${d.date}-${effectiveSubject?.id ?? DAILY}`}
          sectionId={d.section.id}
          subjectId={effectiveSubject?.id ?? null}
          date={d.date!}
          rows={d.roster!}
          requiresReason={d.date! < d.today}
          readOnly={tooOld || !!d.status!.holiday}
        />
      )}
      {lastSaved && <p className="mt-2 text-xs text-muted-foreground">Last saved {formatDateTime(lastSaved)}</p>}

      {d.corrections!.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4" aria-hidden /> Correction history
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {d.corrections!.map((c) => (
                <li key={c.id} className="py-2">
                  <span className="font-medium">{c.student}</span>: {c.old_status} → {c.new_status}
                  <span className="block text-xs text-muted-foreground">
                    {c.actor ?? "System"} · {formatDateTime(c.created_at)}
                    {c.reason && ` · “${c.reason}”`}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
