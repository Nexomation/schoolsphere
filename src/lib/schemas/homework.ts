import { z } from "zod";

export const assignmentInput = z.object({
  id: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || null),
  sectionId: z.uuid("Select a section"),
  subjectId: z.uuid("Select a subject"),
  title: z.string().trim().min(3, "Give the assignment a title").max(200),
  description: z.string().trim().max(10000).default(""),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Choose a due date and time"),
  maxMarks: z.union([z.literal(""), z.coerce.number().positive().max(1000)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  allowLate: z.boolean().default(true),
  publish: z.boolean().default(true),
  isAiAssisted: z.boolean().default(false),
});
export type AssignmentInput = z.output<typeof assignmentInput>;
