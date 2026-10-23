import { formatClockTime } from "@/lib/domain/dates";
import type { TimetableCell } from "@/lib/data/academics";
import { cn } from "@/lib/utils";

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Weekly grid. `mode` decides the secondary line: the teacher for a
 * section's timetable, or the section for a teacher's own timetable.
 */
export function TimetableGrid({
  cells,
  mode,
  todayWeekday,
  renderCell,
}: {
  cells: TimetableCell[];
  mode: "section" | "teacher";
  todayWeekday?: number;
  renderCell?: (day: number, period: number, cell: TimetableCell | undefined) => React.ReactNode;
}) {
  const periods = [...new Set(cells.map((c) => c.period_no))].sort((a, b) => a - b);
  const maxPeriod = Math.max(6, ...periods);
  const periodList = Array.from({ length: maxPeriod }, (_, i) => i + 1);
  const timeOf = (p: number) => cells.find((c) => c.period_no === p);

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <caption className="sr-only">Weekly timetable</caption>
        <thead>
          <tr className="bg-muted/50">
            <th scope="col" className="w-24 border-b px-3 py-2 text-left font-medium text-muted-foreground">
              Day
            </th>
            {periodList.map((p) => (
              <th key={p} scope="col" className="border-b px-2 py-2 text-left font-medium">
                P{p}
                {timeOf(p) && <span className="block text-[11px] font-normal text-muted-foreground">{formatClockTime(timeOf(p)!.start_time)}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, i) => (
            <tr key={day} className={cn(todayWeekday === i + 1 && "bg-accent/40")}>
              <th scope="row" className="border-b px-3 py-2 text-left font-medium">
                {day.slice(0, 3)}
              </th>
              {periodList.map((p) => {
                const cell = cells.find((c) => c.day_of_week === i + 1 && c.period_no === p);
                return (
                  <td key={p} className="border-b border-l px-2 py-1.5 align-top">
                    {renderCell ? (
                      renderCell(i + 1, p, cell)
                    ) : cell ? (
                      <span>
                        <span className="block font-medium">{cell.subject_name ?? "Free"}</span>
                        <span className="block text-xs text-muted-foreground">{mode === "section" ? cell.staff_name ?? "" : cell.section_label}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
