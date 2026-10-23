import { describe, expect, it } from "vitest";
import { GRADE_SCALE_PRESETS, computeExamResult, gradeFor, subjectStatistics, validateBands } from "@/lib/domain/grading";
import { connectionStatus, distanceFromRouteMeters, estimateArrivals, haversineMeters, delayMinutes } from "@/lib/domain/geo";

const bands = GRADE_SCALE_PRESETS.cbse_9_point.bands;

describe("grading", () => {
  it("maps percentages to grade bands", () => {
    expect(gradeFor(91, bands).grade).toBe("A1");
    expect(gradeFor(90.99, bands).grade).toBe("A2");
    expect(gradeFor(0, bands).grade).toBe("E");
  });
  it("validates grade scales", () => {
    expect(validateBands(bands)).toBeNull();
    expect(validateBands([{ minPercent: 50, grade: "P" }, { minPercent: 10, grade: "F" }])).toMatch(/0%/);
  });
  it("passes only when every subject is passed", () => {
    const r = computeExamResult(
      [
        { subjectId: "a", maxMarks: 100, passMarks: 35, marksObtained: 90, isAbsent: false },
        { subjectId: "b", maxMarks: 100, passMarks: 35, marksObtained: 30, isAbsent: false },
      ],
      bands,
    );
    expect(r.totalObtained).toBe(120);
    expect(r.percentage).toBe(60);
    expect(r.status).toBe("fail");
  });
  it("treats absence explicitly according to policy", () => {
    const marks = [
      { subjectId: "a", maxMarks: 100, passMarks: 35, marksObtained: 80, isAbsent: false },
      { subjectId: "b", maxMarks: 50, passMarks: 18, marksObtained: null, isAbsent: true },
    ];
    const zero = computeExamResult(marks, bands, "absent_counts_as_zero");
    expect(zero.totalMax).toBe(150);
    expect(zero.percentage).toBe(53.33);
    expect(zero.status).toBe("fail");
    const excluded = computeExamResult(marks, bands, "absent_excluded");
    expect(excluded.totalMax).toBe(100);
    expect(excluded.percentage).toBe(80);
    expect(excluded.status).toBe("incomplete");
  });
  it("marks results incomplete until every subject is entered", () => {
    const r = computeExamResult([{ subjectId: "a", maxMarks: 100, passMarks: 35, marksObtained: null, isAbsent: false }], bands);
    expect(r.status).toBe("incomplete");
  });
  it("computes subject statistics over students who appeared", () => {
    const s = subjectStatistics(
      [
        { marksObtained: 40, isAbsent: false },
        { marksObtained: 20, isAbsent: false },
        { marksObtained: null, isAbsent: true },
      ],
      35,
    );
    expect(s).toMatchObject({ appeared: 2, absent: 1, average: 30, highest: 40, lowest: 20, passCount: 1, passPercentage: 50 });
  });
});

describe("transport geometry and ETA", () => {
  const stops = [
    { id: "1", name: "A", order: 1, lat: 11.027, lng: 76.944 },
    { id: "2", name: "B", order: 2, lat: 11.009, lng: 76.95 },
    { id: "3", name: "School", order: 3, lat: 11.0003, lng: 76.9781 },
  ];
  it("computes great-circle distances", () => {
    const d = haversineMeters(stops[0], stops[1]);
    expect(d).toBeGreaterThan(2000);
    expect(d).toBeLessThan(2200);
  });
  it("measures distance from the route polyline", () => {
    expect(distanceFromRouteMeters({ lat: 11.018, lng: 76.947 }, stops)).toBeLessThan(100);
    expect(distanceFromRouteMeters({ lat: 11.06, lng: 76.9 }, stops)).toBeGreaterThan(3000);
  });
  it("estimates arrivals forward along the route", () => {
    const now = new Date("2026-10-22T02:00:00Z");
    const r = estimateArrivals(stops, [{ lat: 11.009, lng: 76.95, recordedAt: "2026-10-22T01:59:40Z", speedKmh: 24 }], 1, now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.stops[0].stopId).toBe("3"); // at stop B already, so next is the school
      expect(r.speedKmh).toBe(24);
      expect(r.stops[0].minutes).toBeGreaterThan(5);
    }
  });
  it("refuses to estimate from a stale fix", () => {
    const r = estimateArrivals(stops, [{ lat: 11.02, lng: 76.95, recordedAt: "2026-10-22T01:00:00Z" }], 0, new Date("2026-10-22T02:00:00Z"));
    expect(r).toEqual({ ok: false, reason: "stale_fix" });
  });
  it("reports connection status by fix age", () => {
    const now = new Date("2026-10-22T02:00:00Z");
    expect(connectionStatus("2026-10-22T01:59:30Z", now)).toBe("live");
    expect(connectionStatus("2026-10-22T01:57:00Z", now)).toBe("delayed");
    expect(connectionStatus("2026-10-22T01:40:00Z", now)).toBe("offline");
    expect(connectionStatus(null, now)).toBe("no_data");
  });
  it("computes delay against an IST schedule", () => {
    expect(delayMinutes("2026-10-22T02:10:00Z", "07:30:00", "2026-10-22")).toBe(10);
  });
});
