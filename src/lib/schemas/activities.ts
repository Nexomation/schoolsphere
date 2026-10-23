import { z } from "zod";
import { isoDate, optionalIsoDate, optionalText, optionalUuid, uuid } from "./common";

export const ACTIVITY_CATEGORIES = ["sports", "arts_music", "robotics_stem", "clubs", "competitions", "leadership_volunteering", "projects_exhibitions", "other"] as const;
export const ACHIEVEMENT_CATEGORIES = [...ACTIVITY_CATEGORIES, "academic"] as const;
export const LEVELS = ["school", "zonal", "district", "state", "national", "international"] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  sports: "Sports",
  arts_music: "Arts & music",
  robotics_stem: "Robotics & STEM",
  clubs: "Clubs & societies",
  competitions: "Competitions & hackathons",
  leadership_volunteering: "Leadership & volunteering",
  projects_exhibitions: "Projects & exhibitions",
  academic: "Academic",
  other: "Other",
};

export const activityInput = z
  .object({
    id: optionalUuid,
    name: z.string().trim().min(2).max(120),
    category: z.enum(ACTIVITY_CATEGORIES),
    description: optionalText(2000),
    coordinatorStaffId: optionalUuid,
    schedule: optionalText(120),
    venue: optionalText(120),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
    capacity: z.union([z.literal(""), z.coerce.number().int().min(1).max(1000)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
    registrationOpen: z.boolean().default(true),
    status: z.enum(["active", "completed", "cancelled"]).default("active"),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], message: "End date is before the start date" });

export const achievementInput = z.object({
  studentId: uuid,
  activityId: optionalUuid,
  category: z.enum(ACHIEVEMENT_CATEGORIES),
  title: z.string().trim().min(3).max(200),
  description: optionalText(2000),
  level: z.enum(LEVELS),
  position: optionalText(60),
  achievedOn: isoDate,
});

export const activityAttendanceInput = z.object({
  activityId: uuid,
  sessionDate: isoDate,
  entries: z.array(z.object({ studentId: uuid, present: z.boolean() })).min(1),
});
