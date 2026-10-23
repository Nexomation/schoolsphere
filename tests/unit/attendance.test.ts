import { describe, expect, it } from "vitest";
import { DEFAULT_ATTENDANCE_POLICY, resolvePolicy, summarizeAttendance, type AttendanceEntry } from "@/lib/domain/attendance";

// October 2026: 1st is a Thursday. Sundays: 4, 11, 18, 25.
const range = { from: "2026-10-05", to: "2026-10-10" }; // Mon–Sat
const week: AttendanceEntry[] = [
  { date: "2026-10-05", status: "present" },
  { date: "2026-10-06", status: "late" },
  { date: "2026-10-07", status: "absent" },
  { date: "2026-10-08", status: "present" },
  { date: "2026-10-09", status: "excused" },
];

describe("attendance percentage", () => {
  it("counts present + late over recorded days, excluding excused by default", () => {
    const s = summarizeAttendance(week, range, DEFAULT_ATTENDANCE_POLICY, []);
    expect(s.workingDays).toBe(6);
    expect(s.recordedDays).toBe(5);
    expect(s.notRecordedDays).toBe(1); // Saturday not marked yet — not an absence
    expect(s.attended).toBe(3);
    expect(s.countedDays).toBe(4);
    expect(s.percentage).toBe(75);
  });

  it("never counts holidays or Sundays as absences", () => {
    const s = summarizeAttendance(
      [...week, { date: "2026-10-11", status: "absent" }], // a Sunday record is still counted if recorded (special class)…
      { from: "2026-10-01", to: "2026-10-11" },
      DEFAULT_ATTENDANCE_POLICY,
      [{ start: "2026-10-02", end: "2026-10-02" }],
    );
    // 1 Oct (Thu), 3 (Sat), 5–10 = 8 working days; 2 Oct is a holiday, 4 and 11 are Sundays.
    expect(s.workingDays).toBe(8);
    expect(s.absent).toBe(2);
  });

  it("ignores records on declared holidays", () => {
    const s = summarizeAttendance([{ date: "2026-10-02", status: "absent" }], { from: "2026-10-01", to: "2026-10-03" }, DEFAULT_ATTENDANCE_POLICY, [{ start: "2026-10-02", end: "2026-10-02" }]);
    expect(s.absent).toBe(0);
    expect(s.percentage).toBeNull();
  });

  it("applies school policy switches", () => {
    const strict = { ...DEFAULT_ATTENDANCE_POLICY, lateCountsAsPresent: false, excusedHandling: "count_as_present" as const };
    const s = summarizeAttendance(week, range, strict, []);
    expect(s.attended).toBe(3); // present 2 + excused 1, late not counted
    expect(s.countedDays).toBe(5);
    expect(s.percentage).toBe(60);
  });

  it("returns null when nothing is recorded", () => {
    expect(summarizeAttendance([], range, DEFAULT_ATTENDANCE_POLICY, []).percentage).toBeNull();
  });

  it("falls back to defaults for malformed settings", () => {
    expect(resolvePolicy({ attendance: { workingWeekdays: [], excusedHandling: "weird" } })).toEqual(DEFAULT_ATTENDANCE_POLICY);
    expect(resolvePolicy({ attendance: { workingWeekdays: [1, 2, 3, 4, 5] } }).workingWeekdays).toEqual([1, 2, 3, 4, 5]);
  });
});
