import { z } from "zod";
import { optionalEmail, optionalText } from "./common";

export const BOARDS = ["STATE_BOARD", "MATRICULATION", "CBSE", "ICSE", "IB", "IGCSE", "OTHER"] as const;
export const BOARD_LABELS: Record<string, string> = {
  STATE_BOARD: "Tamil Nadu State Board",
  MATRICULATION: "Matriculation",
  CBSE: "CBSE",
  ICSE: "ICSE / ISC",
  IB: "IB",
  IGCSE: "Cambridge IGCSE",
  OTHER: "Other",
};

export const schoolProfileInput = z.object({
  name: z.string().trim().min(2).max(200),
  board: z.enum(BOARDS),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(80),
  district: optionalText(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.union([z.literal(""), z.string().regex(/^[1-9][0-9]{5}$/, "6-digit PIN code")]).optional().transform((v) => v || null),
  phone: optionalText(20),
  email: optionalEmail,
  website: optionalText(200),
  udiseCode: optionalText(20),
});

export const brandingInput = z.object({
  appName: z.string().trim().max(40).optional().transform((v) => v || undefined),
  primaryColor: z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #4f46e5")]).optional().transform((v) => v || undefined),
  logoUrl: z.union([z.literal(""), z.url().startsWith("https://", "Use an https:// address")]).optional().transform((v) => v || undefined),
});

export const policyInput = z.object({
  workingWeekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Select at least one working day"),
  lateCountsAsPresent: z.boolean(),
  excusedHandling: z.enum(["exclude", "count_as_present"]),
  lowAttendanceThreshold: z.coerce.number().min(1).max(100),
  attendanceEditWindowDays: z.coerce.number().int().min(0).max(60),
  absentPolicy: z.enum(["absent_counts_as_zero", "absent_excluded"]),
  receiptPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,6}$/, "2–6 letters or numbers"),
});

export const gradeScaleInput = z.object({
  name: z.string().trim().min(2).max(80),
  bands: z
    .array(z.object({ minPercent: z.coerce.number().min(0).max(100), grade: z.string().trim().min(1).max(4), gradePoint: z.union([z.literal(""), z.coerce.number().min(0).max(10)]).optional(), remark: z.string().trim().max(40).optional() }))
    .min(2)
    .max(15),
  makeDefault: z.boolean().default(false),
});
