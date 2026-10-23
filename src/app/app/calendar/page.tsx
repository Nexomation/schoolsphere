import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { MonthCalendar, type CalendarMark } from "@/components/month-calendar";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, humanize } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listEvents } from "@/lib/data/academics";
import { schoolToday } from "@/lib/data/school";
import { eachDate, formatDate, monthRange } from "@/lib/domain/dates";
import { deleteEventAction } from "../academics/actions";
import { EventForm } from "./event-form";

export const metadata: Metadata = { title: "Calendar" };

const TONE: Record<string, CalendarMark["tone"]> = { holiday: "warning", exam: "info", event: "accent", ptm: "success", other: "muted" };

export default async function CalendarPage({ searchParams }: PageProps<"/app/calendar">) {
  const ctx = await requirePageContext("calendar.view");
  const sp = await searchParams;
  const today = await ctx.db((sql) => schoolToday(sql, ctx.schoolId));
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const { from, to } = monthRange(month);
  const events = await ctx.db((sql) => listEvents(sql, ctx.schoolId, from, to));
  const marks = new Map<string, CalendarMark[]>();
  for (const e of events) {
    for (const d of eachDate(e.start_date < from ? from : e.start_date, e.end_date > to ? to : e.end_date)) {
      marks.set(d, [...(marks.get(d) ?? []), { date: d, label: e.title, tone: TONE[e.event_type] ?? "muted" }]);
    }
  }
  const manage = can(ctx.role, "academics.manage");

  return (
    <>
      <PageHeader title="School calendar" description="Holidays are excluded from attendance calculations automatically." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="pt-6">
            <MonthCalendar month={month} today={today} marks={marks} hrefFor={(m) => `?month=${m}`} />
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {Object.entries(TONE).map(([type, tone]) => (
                <span key={type} className="flex items-center gap-1.5">
                  <StatusBadge status={type} label={type === "ptm" ? "Parent–teacher meeting" : humanize(type)} tone={tone === "muted" ? "neutral" : tone} />
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>This month</CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events this month.</p>
              ) : (
                <ul className="grid gap-3">
                  {events.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{e.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(e.start_date)}
                          {e.end_date !== e.start_date && ` – ${formatDate(e.end_date)}`}
                        </p>
                        {e.description && <p className="mt-0.5 text-xs text-muted-foreground">{e.description}</p>}
                      </div>
                      {manage && (
                        <ConfirmAction
                          action={deleteEventAction.bind(null, e.id)}
                          title="Delete this event?"
                          description={`"${e.title}" will be removed from the calendar.${e.event_type === "holiday" ? " Attendance percentages will treat these days as working days again." : ""}`}
                          confirmLabel="Delete"
                          variant="destructive"
                          trigger={
                            <Button size="icon-sm" variant="ghost" aria-label={`Delete ${e.title}`}>
                              <Trash2 />
                            </Button>
                          }
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {manage && (
            <Card>
              <CardHeader>
                <CardTitle>Add event or holiday</CardTitle>
              </CardHeader>
              <CardContent>
                <EventForm defaultDate={today} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
