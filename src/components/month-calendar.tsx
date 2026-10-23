import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, eachDate, isoWeekday, monthRange } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";

export type CalendarMark = { date: string; label?: string; tone: "success" | "danger" | "warning" | "info" | "muted" | "accent" };

const toneClass: Record<CalendarMark["tone"], string> = {
  success: "bg-success/15 text-success",
  danger: "bg-destructive/15 text-destructive",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/15 text-info",
  muted: "bg-muted text-muted-foreground",
  accent: "bg-accent text-accent-foreground",
};

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Server-rendered month grid (Monday first). `hrefFor` builds the prev/next month links. */
export function MonthCalendar({
  month,
  today,
  marks,
  hrefFor,
  renderDay,
}: {
  month: string;
  today: string;
  marks?: Map<string, CalendarMark[]>;
  hrefFor: (month: string) => string;
  renderDay?: (date: string) => React.ReactNode;
}) {
  const { from, to } = monthRange(month);
  const lead = isoWeekday(from) - 1;
  const days = eachDate(addDays(from, -lead), to);
  while (days.length % 7 !== 0) days.push(addDays(days[days.length - 1], 1));
  const title = new Date(`${from}T00:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">{title}</h3>
        <div className="no-print flex gap-1">
          <Link href={hrefFor(shiftMonth(month, -1))} className="flex size-8 items-center justify-center rounded-md border hover:bg-muted" aria-label="Previous month" scroll={false}>
            <ChevronLeft className="size-4" />
          </Link>
          <Link href={hrefFor(shiftMonth(month, 1))} className="flex size-8 items-center justify-center rounded-md border hover:bg-muted" aria-label="Next month" scroll={false}>
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground" aria-hidden>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={title}>
        {days.map((d) => {
          const inMonth = d >= from && d <= to;
          const dayMarks = marks?.get(d) ?? [];
          return (
            <div
              key={d}
              role="gridcell"
              aria-label={`${d}${dayMarks.length ? `: ${dayMarks.map((m) => m.label).join(", ")}` : ""}`}
              className={cn(
                "min-h-14 rounded-lg border p-1 text-left text-xs sm:min-h-20",
                !inMonth && "border-transparent opacity-40",
                d === today && "border-primary ring-1 ring-primary",
              )}
            >
              <span className={cn("tabular font-medium", isoWeekday(d) === 7 && "text-destructive/80")}>{Number(d.slice(8))}</span>
              {renderDay
                ? renderDay(d)
                : dayMarks.map((m, i) => (
                    <span key={i} className={cn("mt-0.5 block truncate rounded px-1 py-0.5 text-[10px] leading-tight sm:text-[11px]", toneClass[m.tone])}>
                      {m.label}
                    </span>
                  ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
