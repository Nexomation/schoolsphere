/**
 * Permission matrix. This is the application-level check (server actions,
 * route handlers, navigation). The database enforces the same boundaries
 * independently with Row Level Security (supabase/migrations/*_rls.sql), so a
 * missing check here cannot leak another school's or family's data.
 *
 * Shared between server and client (for hiding navigation only).
 */
export const ROLES = [
  "school_admin",
  "accountant",
  "teacher",
  "parent",
  "student",
  "transport_coordinator",
  "driver",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  school_admin: "School Administrator",
  accountant: "Accountant",
  teacher: "Teacher",
  parent: "Parent / Guardian",
  student: "Student",
  transport_coordinator: "Transport Coordinator",
  driver: "Bus Driver",
};

/** When a user has several roles in a school, the first one in this list opens by default. */
export const ROLE_PRIORITY: Role[] = ["school_admin", "accountant", "teacher", "transport_coordinator", "driver", "parent", "student"];

const A: Role = "school_admin";
const ACC: Role = "accountant";
const T: Role = "teacher";
const P: Role = "parent";
const S: Role = "student";
const TC: Role = "transport_coordinator";
const D: Role = "driver";

export const PERMISSIONS = {
  "dashboard.view": [A, ACC, T, P, S, TC, D],
  "students.view": [A, ACC, T, TC],
  "students.manage": [A],
  "guardians.verify": [A],
  "staff.view": [A],
  "staff.manage": [A],
  "academics.manage": [A],
  "timetable.view": [A, T, P, S],
  "calendar.view": [A, ACC, T, P, S, TC, D],
  "attendance.mark": [A, T],
  "attendance.view": [A, T, P, S],
  "homework.manage": [A, T],
  "homework.submit": [S],
  "homework.view": [A, T, P, S],
  "exams.view": [A, T, P, S],
  "exams.manage": [A],
  "marks.enter": [A, T],
  "fees.view": [A, ACC, P],
  "fees.manage": [A, ACC],
  "payments.record": [A, ACC],
  "payments.pay": [P],
  "transport.view": [A, TC, P],
  "transport.manage": [A, TC],
  "transport.drive": [D],
  "activities.view": [A, ACC, T, P, S, TC],
  "activities.manage": [A, T],
  "achievements.submit": [A, T, P],
  "achievements.verify": [A, T],
  "announcements.view": [A, ACC, T, P, S, TC, D],
  "announcements.publish": [A, T],
  "ai.use": [A, T, ACC],
  "reports.view": [A, ACC],
  "settings.manage": [A],
  "users.manage": [A],
  "audit.view": [A],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
