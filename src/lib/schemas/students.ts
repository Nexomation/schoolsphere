import { z } from "zod";
import { BLOOD_GROUPS, GENDERS, RELATIONSHIPS, indianPhone, isoDate, optionalEmail, optionalText, uuid } from "./common";

export const guardianInput = z.object({
  fullName: z.string().trim().min(2, "Enter the guardian's name").max(120),
  relationship: z.enum(RELATIONSHIPS),
  phone: indianPhone,
  email: optionalEmail,
  occupation: optionalText(120),
});

export const studentInput = z.object({
  admissionNo: z.string().trim().min(1, "Admission number is required").max(30).regex(/^[A-Za-z0-9/_-]+$/, "Use letters, numbers, / _ or -"),
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().max(80).default(""),
  dateOfBirth: isoDate,
  gender: z.enum(GENDERS, "Select a gender"),
  bloodGroup: z.union([z.literal(""), z.enum(BLOOD_GROUPS)]).optional().transform((v) => v || null),
  address: optionalText(500),
  emisNo: optionalText(30),
  admissionDate: isoDate,
  medicalNotes: optionalText(1000),
});

export const admissionInput = studentInput.extend({
  sectionId: uuid,
  rollNo: z.coerce.number().int().min(1).max(500).optional().or(z.literal("").transform(() => undefined)),
  guardian: guardianInput,
});
export type AdmissionInput = z.output<typeof admissionInput>;

export const studentUpdateInput = studentInput.extend({ id: uuid });

export const statusChangeInput = z.object({
  studentId: uuid,
  status: z.enum(["transferred", "withdrawn", "graduated", "active"]),
  effectiveDate: isoDate,
  reason: z.string().trim().min(3, "Give a short reason").max(300),
});

export const linkGuardianInput = guardianInput.extend({ studentId: uuid, isPrimary: z.boolean().default(false), verify: z.boolean().default(true) });

export const promotionInput = z.object({
  fromSectionId: uuid,
  toSectionId: uuid,
  studentIds: z.array(uuid).min(1, "Select at least one student"),
});
