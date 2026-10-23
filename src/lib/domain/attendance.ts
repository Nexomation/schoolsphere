import { eachDate, isoWeekday } from "./dates";

/**
 * Attendance policy (stored per school in schools.settings.attendance).
 *
 * Definitions used everywhere in SchoolSphere:
 *  - A WORKING DAY is a date whose weekday is in `workingWeekdays` and which is
 *    not inside a holiday on the school calendar. Holidays and weekends are
 *    never counted as absences.
 *  - A day only counts towards the percentage when daily (homeroom)
 *    attendance was actually recorded for the student. Unmarked working days
 *    are reported separately as "not recorded", never as absent.
 *  - Attendance recorded on a non-working day (e.g. a special Saturday) counts
 *    like any other recorded day, unless the date is a declared holiday.
 *  - present counts as attended; absent does not; late counts as attended when
 *    `lateCountsAsPresent`; excused is either counted as attended or removed
 *    from the denominator according to `excusedHandling`.
 *  - Percentage = attended / counted days × 100, rounded to one decimal. It is
 *    null when no days were recorded.
 */
export type AttendancePolicy = {
  workingWeekdays: number[]; // ISO weekdays, 1 = Monday
  lateCountsAsPresent: boolean;
  excusedHandling: "count_as_present" | "exclude";
  /** Below this percentage a student is flagged for follow-up. */
  lowAttendanceThreshold: number;
};

export const DEFAULT_ATTENDANCE_POLICY: AttendancePolicy = {
  workingWeekdays: [1, 2, 3, 4, 5, 6],
  lateCountsAsPresent: true,
  excusedHandling: "exclude",
  lowAttendanceThreshold: 75,
};

export function resolvePolicy(settings: unknown): AttendancePolicy {
  const raw = (settings as { attendance?: Partial<AttendancePolicy> } | null)?.attendance ?? {};
  return {
    workingWeekdays: Array.isArray(raw.workingWeekdays) && raw.workingWeekdays.length
      ? raw.workingWeekdays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
      : DEFAULT_ATTENDANCE_POLICY.workingWeekdays,
    lateCountsAsPresent: raw.lateCountsAsPresent ?? DEFAULT_ATTENDANCE_POLICY.lateCountsAsPresent,
    excusedHandling: raw.excusedHandling === "count_as_present" ? "count_as_present" : "exclude",
    lowAttendanceThreshold:
      typeof raw.lowAttendanceThreshold === "number" ? raw.lowAttendanceThreshold : DEFAULT_ATTENDANCE_POLICY.lowAttendanceThreshold,
  };
}

export type AttendanceStatus = "present" | "absent" | "late" | "excused";
export type AttendanceEntry = { date: string; status: AttendanceStatus };
export type HolidayRange = { start: string; end: string };

export function holidaySet(holidays: HolidayRange[], from: string, to: string): Set<string> {
  const set = new Set<string>();
  for (const h of holidays) {
    const start = h.start < from ? from : h.start;
    const end = h.end > to ? to : h.end;
    if (start <= end) for (const d of eachDate(start, end)) set.add(d);
  }
  return set;
}

export function isWorkingDay(date: string, policy: AttendancePolicy, holidays: Set<string>): boolean {
  return policy.workingWeekdays.includes(isoWeekday(date)) && !holidays.has(date);
}

export type AttendanceSummary = {
  workingDays: number;
  recordedDays: number;
  notRecordedDays: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  attended: number;
  countedDays: number;
  percentage: number | null;
};

export function summarizeAttendance(
  entries: AttendanceEntry[],
  range: { from: string; to: string },
  policy: AttendancePolicy,
  holidays: HolidayRange[],
): AttendanceSummary {
  const holidayDates = holidaySet(holidays, range.from, range.to);
  const byDate = new Map<string, AttendanceStatus>();
  for (const e of entries) {
    if (e.date >= range.from && e.date <= range.to && !holidayDates.has(e.date)) byDate.set(e.date, e.status);
  }

  let workingDays = 0;
  let notRecordedDays = 0;
  for (const d of eachDate(range.from, range.to)) {
    if (isWorkingDay(d, policy, holidayDates)) {
      workingDays++;
      if (!byDate.has(d)) notRecordedDays++;
    }
  }

  const count = (s: AttendanceStatus) => [...byDate.values()].filter((v) => v === s).length;
  const present = count("present");
  const late = count("late");
  const absent = count("absent");
  const excused = count("excused");

  let attended = present + (policy.lateCountsAsPresent ? late : 0);
  let countedDays = byDate.size;
  if (policy.excusedHandling === "count_as_present") attended += excused;
  else countedDays -= excused;

  return {
    workingDays,
    recordedDays: byDate.size,
    notRecordedDays,
    present,
    late,
    absent,
    excused,
    attended,
    countedDays,
    percentage: countedDays > 0 ? Math.round((attended / countedDays) * 1000) / 10 : null,
  };
}
