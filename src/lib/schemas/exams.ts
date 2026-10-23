import { z } from "zod";
import { optionalIsoDate, optionalUuid, uuid } from "./common";

export const examInput = z
  .object({
    classId: uuid,
    termId: optionalUuid,
    gradeScaleId: optionalUuid,
    name: z.string().trim().min(2, "Name the examination").max(120),
    examType: z.enum(["unit_test", "term", "annual", "other"]),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
    subjects: z
      .array(
        z
          .object({
            subjectId: uuid,
            include: z.boolean(),
            maxMarks: z.coerce.number().positive("Must be more than 0").max(1000),
            passMarks: z.coerce.number().min(0).max(1000),
            examDate: optionalIsoDate,
          })
          .refine((s) => s.passMarks <= s.maxMarks, { path: ["passMarks"], message: "Pass marks cannot exceed the maximum" }),
      )
      .refine((list) => list.some((s) => s.include), "Include at least one subject"),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], message: "End date is before the start date" });

export const marksEntryInput = z.object({
  examSubjectId: uuid,
  correctionReason: z.string().trim().max(300).optional(),
  entries: z
    .array(
      z.object({
        studentId: uuid,
        absent: z.boolean(),
        marks: z.union([z.literal(""), z.null(), z.coerce.number().min(0, "Marks cannot be negative")]).transform((v) => (v === "" ? null : v)),
        remarks: z.string().trim().max(300).optional(),
      }),
    )
    .min(1),
});

export const remarkInput = z.object({
  examinationId: uuid,
  studentId: uuid,
  remark: z.string().trim().min(2, "Write a remark").max(1000),
});
