import { z } from "zod";

/** Indian mobile numbers: 10 digits starting 6–9, optionally prefixed with +91 / 91 / 0. Normalised to +91XXXXXXXXXX. */
export const indianPhone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .refine((v) => /^(?:\+?91|0)?[6-9]\d{9}$/.test(v), "Enter a 10-digit Indian mobile number")
  .transform((v) => `+91${v.slice(-10)}`);

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const optionalEmail = z
  .union([z.literal(""), z.email("Enter a valid email address")])
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null));

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
export const optionalIsoDate = z
  .union([z.literal(""), isoDate])
  .optional()
  .transform((v) => (v ? v : null));

export const uuid = z.uuid("Select a valid option");
export const optionalUuid = z
  .union([z.literal(""), z.uuid()])
  .optional()
  .transform((v) => (v ? v : null));

/** Accepts DD/MM/YYYY, DD-MM-YYYY or YYYY-MM-DD (as typed in Indian spreadsheets). */
export function normaliseDate(input: string): string | null {
  const v = input.trim();
  let y: number, m: number, d: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) [y, m, d] = v.split("-").map(Number);
  else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(v)) [d, m, y] = v.split(/[/-]/).map(Number);
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export const RELATIONSHIPS = ["father", "mother", "guardian", "grandparent", "sibling", "other"] as const;
export const GENDERS = ["male", "female", "other"] as const;
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
