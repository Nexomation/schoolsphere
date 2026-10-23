import { z } from "zod";
import { isoDate, optionalEmail, optionalIsoDate, optionalText, optionalUuid, uuid } from "./common";

export const STAFF_TYPES = ["teaching", "administrative", "accounts", "transport", "support"] as const;

export const staffInput = z.object({
  id: optionalUuid,
  employeeCode: z.string().trim().min(1, "Employee code is required").max(30),
  fullName: z.string().trim().min(2, "Enter the full name").max(120),
  email: optionalEmail,
  phone: optionalText(20),
  designation: z.string().trim().min(2).max(80),
  staffType: z.enum(STAFF_TYPES),
  dateOfJoining: optionalIsoDate,
  status: z.enum(["active", "on_leave", "left"]).default("active"),
});

export const academicYearInput = z
  .object({
    name: z.string().trim().regex(/^\d{4}-\d{2}$/, "Use the format 2027-28"),
    startDate: isoDate,
    endDate: isoDate,
    makeCurrent: z.boolean().default(false),
    termCount: z.coerce.number().int().min(1).max(4).default(3),
  })
  .refine((v) => v.endDate > v.startDate, { path: ["endDate"], message: "End date must be after the start date" });

export const classInput = z.object({
  name: z.string().trim().min(1).max(40),
  gradeLevel: z.coerce.number().int().min(-2).max(12),
});

export const sectionInput = z.object({
  classId: uuid,
  name: z.string().trim().regex(/^[A-Za-z0-9 -]{1,20}$/, "Use letters or numbers, e.g. A"),
  classTeacherId: optionalUuid,
  room: optionalText(20),
  capacity: z.coerce.number().int().min(1).max(200).optional().or(z.literal("").transform(() => undefined)),
});

export const subjectInput = z.object({
  name: z.string().trim().min(1).max(80),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,12}$/, "2–12 letters or numbers"),
});

export const teacherAssignmentInput = z.object({
  staffId: uuid,
  sectionId: uuid,
  subjectId: optionalUuid,
});

export const calendarEventInput = z
  .object({
    title: z.string().trim().min(2).max(200),
    description: optionalText(1000),
    eventType: z.enum(["holiday", "exam", "event", "ptm", "other"]),
    startDate: isoDate,
    endDate: isoDate,
    notifyFamilies: z.boolean().default(false),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "End date cannot be before the start date" });

export const timetableEntryInput = z
  .object({
    sectionId: uuid,
    dayOfWeek: z.coerce.number().int().min(1).max(6),
    periodNo: z.coerce.number().int().min(1).max(12),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    subjectId: optionalUuid,
    staffId: optionalUuid,
    room: optionalText(20),
  })
  .refine((v) => v.endTime > v.startTime, { path: ["endTime"], message: "End time must be after start time" });
