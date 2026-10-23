/**
 * Grading rules.
 *
 *  - Marks are entered per subject out of that subject's maximum.
 *  - An ABSENT student is recorded explicitly. Under the default policy
 *    ("absent_counts_as_zero") the subject's maximum still counts in the total
 *    and the student is marked as not passed in that subject; the report card
 *    shows "AB", never a fabricated score. The alternative policy
 *    ("absent_excluded") removes the subject from the total and percentage
 *    (used for medically excused absences) and the result is "incomplete".
 *  - A subject is passed when marks >= that subject's pass marks.
 *  - The overall result is PASS only when every subject is passed.
 *  - Percentage = total obtained / total maximum × 100, rounded to 2 decimals.
 *  - Grades come from the school's grade scale bands (highest minPercent that
 *    the percentage reaches).
 */

export type GradeBand = { minPercent: number; grade: string; gradePoint?: number; remark?: string };

export const GRADE_SCALE_PRESETS: Record<string, { name: string; bands: GradeBand[] }> = {
  cbse_9_point: {
    name: "CBSE 9-point (A1–E)",
    bands: [
      { minPercent: 91, grade: "A1", gradePoint: 10, remark: "Outstanding" },
      { minPercent: 81, grade: "A2", gradePoint: 9, remark: "Excellent" },
      { minPercent: 71, grade: "B1", gradePoint: 8, remark: "Very good" },
      { minPercent: 61, grade: "B2", gradePoint: 7, remark: "Good" },
      { minPercent: 51, grade: "C1", gradePoint: 6, remark: "Above average" },
      { minPercent: 41, grade: "C2", gradePoint: 5, remark: "Average" },
      { minPercent: 33, grade: "D", gradePoint: 4, remark: "Satisfactory" },
      { minPercent: 0, grade: "E", gradePoint: 0, remark: "Needs improvement" },
    ],
  },
  tn_state_board: {
    name: "Tamil Nadu State Board (A–E)",
    bands: [
      { minPercent: 90, grade: "A+", remark: "Outstanding" },
      { minPercent: 75, grade: "A", remark: "Excellent" },
      { minPercent: 60, grade: "B", remark: "Very good" },
      { minPercent: 50, grade: "C", remark: "Good" },
      { minPercent: 35, grade: "D", remark: "Satisfactory" },
      { minPercent: 0, grade: "E", remark: "Needs improvement" },
    ],
  },
};

export function validateBands(bands: GradeBand[]): string | null {
  if (bands.length < 2) return "A grade scale needs at least two bands";
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  if (sorted[sorted.length - 1].minPercent !== 0) return "The lowest band must start at 0%";
  const mins = new Set(sorted.map((b) => b.minPercent));
  if (mins.size !== sorted.length) return "Two bands start at the same percentage";
  if (sorted.some((b) => b.minPercent < 0 || b.minPercent > 100)) return "Band percentages must be between 0 and 100";
  if (sorted.some((b) => !b.grade.trim())) return "Every band needs a grade label";
  return null;
}

export function gradeFor(percent: number, bands: GradeBand[]): GradeBand {
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  return sorted.find((b) => percent >= b.minPercent) ?? sorted[sorted.length - 1];
}

export type AbsentPolicy = "absent_counts_as_zero" | "absent_excluded";

export type SubjectMark = {
  subjectId: string;
  maxMarks: number;
  passMarks: number;
  marksObtained: number | null;
  isAbsent: boolean;
};

export type SubjectResult = SubjectMark & { entered: boolean; passed: boolean; percent: number | null };

export type ExamResult = {
  subjects: SubjectResult[];
  totalObtained: number;
  totalMax: number;
  percentage: number | null;
  grade: GradeBand | null;
  status: "pass" | "fail" | "incomplete";
  absentCount: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeExamResult(
  marks: SubjectMark[],
  bands: GradeBand[],
  policy: AbsentPolicy = "absent_counts_as_zero",
): ExamResult {
  const subjects: SubjectResult[] = marks.map((m) => {
    const entered = m.isAbsent || m.marksObtained !== null;
    const passed = !m.isAbsent && m.marksObtained !== null && m.marksObtained >= m.passMarks;
    return {
      ...m,
      entered,
      passed,
      percent: m.marksObtained !== null ? round2((m.marksObtained / m.maxMarks) * 100) : null,
    };
  });

  let totalObtained = 0;
  let totalMax = 0;
  let absentCount = 0;
  for (const s of subjects) {
    if (s.isAbsent) {
      absentCount++;
      if (policy === "absent_excluded") continue;
      totalMax += s.maxMarks;
    } else if (s.marksObtained !== null) {
      totalObtained += s.marksObtained;
      totalMax += s.maxMarks;
    }
  }

  const allEntered = subjects.length > 0 && subjects.every((s) => s.entered);
  const percentage = totalMax > 0 ? round2((totalObtained / totalMax) * 100) : null;

  let status: ExamResult["status"];
  if (!allEntered || (policy === "absent_excluded" && absentCount > 0)) status = "incomplete";
  else status = subjects.every((s) => s.passed) ? "pass" : "fail";

  return {
    subjects,
    totalObtained: round2(totalObtained),
    totalMax,
    percentage,
    grade: percentage === null ? null : gradeFor(percentage, bands),
    status,
    absentCount,
  };
}

export type SubjectStatistics = {
  appeared: number;
  absent: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  passCount: number;
  passPercentage: number | null;
};

/** Statistics over students who appeared; absentees are reported separately. */
export function subjectStatistics(entries: { marksObtained: number | null; isAbsent: boolean }[], passMarks: number): SubjectStatistics {
  const appeared = entries.filter((e) => !e.isAbsent && e.marksObtained !== null).map((e) => e.marksObtained as number);
  const absent = entries.filter((e) => e.isAbsent).length;
  if (appeared.length === 0) {
    return { appeared: 0, absent, average: null, highest: null, lowest: null, passCount: 0, passPercentage: null };
  }
  const passCount = appeared.filter((m) => m >= passMarks).length;
  return {
    appeared: appeared.length,
    absent,
    average: round2(appeared.reduce((s, m) => s + m, 0) / appeared.length),
    highest: Math.max(...appeared),
    lowest: Math.min(...appeared),
    passCount,
    passPercentage: round2((passCount / appeared.length) * 100),
  };
}
