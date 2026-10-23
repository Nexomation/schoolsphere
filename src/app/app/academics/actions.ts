"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { requireActionContext } from "@/lib/auth/context";
import {
  createAssignment,
  createClass,
  createEvent,
  createSection,
  createSubject,
  createYear,
  deleteAssignment,
  deleteEvent,
  deleteTimetableEntry,
  saveStaff,
  saveTimetableEntry,
  setCurrentYear,
  setSubjectActive,
  updateSectionTeacher,
} from "@/lib/data/academics";
import { notifyUsers } from "@/lib/data/notifications";
import { currentYear, maybeCurrentYear } from "@/lib/data/school";
import {
  academicYearInput,
  calendarEventInput,
  classInput,
  sectionInput,
  staffInput,
  subjectInput,
  teacherAssignmentInput,
  timetableEntryInput,
} from "@/lib/schemas/academics";
import { formatDate } from "@/lib/domain/dates";

const done = (path: string, message: string) => {
  revalidatePath(path);
  return ok(null, message);
};

export async function saveStaffAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("staff.manage");
    const data = parseInput(staffInput, input);
    await ctx.db((sql) => saveStaff(sql, ctx.schoolId, data));
    return done("/app/staff", data.id ? "Staff record updated" : "Staff member added");
  });
}

export async function createYearAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("academics.manage");
    const data = parseInput(academicYearInput, input);
    await ctx.db((sql) => createYear(sql, ctx.schoolId, data));
    return done("/app/academics", `Academic year ${data.name} created`);
  });
}

export async function setCurrentYearAction(yearId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("academics.manage");
    await ctx.db((sql) => setCurrentYear(sql, ctx.schoolId, z.uuid().parse(yearId)), { reason: "Changed current academic year" });
    revalidatePath("/app", "layout");
    return ok(null, "Current academic year changed");
  });
}

export async function createClassAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("academics.manage");
    const data = parseInput(classInput, input);
    await ctx.db((sql) => createClass(sql, ctx.schoolId, data));
    return done("/app/academics", `${data.name} added`);
  });
}

export async function createSectionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("academics.manage");
    const data = parseInput(sectionInput, input);
    await ctx.db(async (sql) => createSection(sql, ctx.schoolId, (await currentYear(sql, ctx.schoolId)).id, data));
    return done("/app/academics", `Section ${data.name.toUpperCase()} added`);
  });
}

export async function setClassTeacherAction(sectionId: string, staffId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("academics.manage");
    await ctx.db((sql) => updateSectionTeacher(sql, ctx.schoolId, z.uuid().parse(sectionId), staffId ? z.uuid().parse(staffId) : null));
    return done("/app/academics", "Class teacher updated");
  });
}

export async function createSubjectAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("academics.manage");
    const data = parseInput(subjectInput, input);
    await ctx.db((sql) => createSubject(sql, ctx.schoolId, data));
    return done("/app/academics", `${data.name} added`);
  });
}

export async function setSubjectActiveAction(id: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("academics.manage");
    await ctx.db((sql) => setSubjectActive(sql, ctx.schoolId, z.uuid().parse(id), active));
    return done("/app/academics", active ? "Subject re-activated" : "Subject archived");
  });
}

export async function createAssignmentAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("academics.manage");
    const data = parseInput(teacherAssignmentInput, input);
    await ctx.db((sql) => createAssignment(sql, ctx.schoolId, data));
    return done("/app/academics", "Teacher assigned");
  });
}

export async function deleteAssignmentAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("academics.manage");
    await ctx.db((sql) => deleteAssignment(sql, ctx.schoolId, z.uuid().parse(id)));
    return done("/app/academics", "Assignment removed");
  });
}

export async function createEventAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("academics.manage");
    const data = parseInput(calendarEventInput, input);
    const recipients = await ctx.db(async (sql) => {
      const year = await maybeCurrentYear(sql, ctx.schoolId);
      await createEvent(sql, ctx.schoolId, ctx.userId, year?.id ?? null, data);
      if (!data.notifyFamilies) return [];
      return (
        await sql.many<{ user_id: string }>(
          "select user_id from school_memberships where school_id = $1 and status = 'active' and role in ('parent', 'student', 'teacher')",
          [ctx.schoolId],
        )
      ).map((r) => r.user_id);
    });
    if (recipients.length) {
      await notifyUsers(
        {
          schoolId: ctx.schoolId,
          userIds: recipients,
          type: "event",
          title: data.eventType === "holiday" ? `Holiday: ${data.title}` : data.title,
          body: `${formatDate(data.startDate)}${data.endDate !== data.startDate ? ` – ${formatDate(data.endDate)}` : ""}${data.description ? `. ${data.description}` : ""}`,
          link: "/app/calendar",
        },
        ctx.userId,
      );
    }
    return done("/app/calendar", "Event added to the calendar");
  });
}

export async function deleteEventAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("academics.manage");
    await ctx.db((sql) => deleteEvent(sql, ctx.schoolId, z.uuid().parse(id)));
    return done("/app/calendar", "Event removed");
  });
}

export async function saveTimetableEntryAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("academics.manage");
    const data = parseInput(timetableEntryInput, input);
    await ctx.db((sql) => saveTimetableEntry(sql, ctx.schoolId, data));
    return done("/app/timetable", "Timetable updated");
  });
}

export async function deleteTimetableEntryAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("academics.manage");
    await ctx.db((sql) => deleteTimetableEntry(sql, ctx.schoolId, z.uuid().parse(id)));
    return done("/app/timetable", "Period cleared");
  });
}
