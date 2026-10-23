import "server-only";
import { pgArray, withService, withUser } from "../db";
import type { Sql } from "../db/types";
import { deliverExternally } from "../notifications/channels";
import { logger } from "../logger";

export const NOTIFICATION_TYPES = [
  "attendance",
  "homework",
  "marks",
  "fees",
  "announcement",
  "event",
  "transport",
  "activity",
  "admin",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  attendance: "Attendance",
  homework: "Homework & deadlines",
  marks: "Marks & results",
  fees: "Fee reminders & receipts",
  announcement: "School announcements",
  event: "Events & holidays",
  transport: "Transport pickup & drop-off",
  activity: "Activities & achievements",
  admin: "Administrative updates",
};

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export async function unreadCount(userId: string): Promise<number> {
  const row = await withUser({ userId }, (sql) =>
    sql.one<{ n: number }>("select count(*)::int as n from notifications where user_id = $1 and read_at is null", [userId]),
  );
  return row.n;
}

export async function listNotifications(sql: Sql, userId: string, filter: "all" | "unread" = "all") {
  return sql.many<NotificationRow>(
    `select id, type, title, body, link, read_at, created_at from notifications
     where user_id = $1 ${filter === "unread" ? "and read_at is null" : ""}
     order by created_at desc limit 200`,
    [userId],
  );
}

export type NotifyInput = {
  schoolId: string;
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
};

/**
 * Fan-out to other users. Callers must have authorized the underlying event
 * already (e.g. the teacher was allowed to mark this attendance). Runs in the
 * trusted context because users cannot insert notifications for others.
 * Respects each recipient's in-app preference; external channels are only
 * attempted when configured (see lib/notifications/channels.ts).
 */
export async function notifyUsers(input: NotifyInput, actorUserId?: string): Promise<void> {
  const recipients = [...new Set(input.userIds)].filter(Boolean);
  if (recipients.length === 0) return;
  try {
    const inserted = await withService(
      (sql) =>
        sql.many<{ id: string; user_id: string }>(
          `insert into notifications (school_id, user_id, type, title, body, link)
           select $1, u.id, $3, $4, $5, $6
           from unnest($2::uuid[]) as u(id)
           where not exists (
             select 1 from notification_preferences p where p.user_id = u.id and p.type = $3 and not p.in_app
           )
           returning id, user_id`,
          [input.schoolId, pgArray(recipients), input.type, input.title.slice(0, 200), input.body.slice(0, 1000), input.link ?? null],
        ),
      { actorUserId },
    );
    await deliverExternally(input, inserted);
  } catch (error) {
    // A failed notification must never roll back the business action that triggered it.
    logger.error("Notification fan-out failed", { error, type: input.type, schoolId: input.schoolId });
  }
}

/** Active guardian accounts (verified links only) for the given students. */
export async function guardianUserIds(sql: Sql, studentIds: string[]): Promise<Map<string, string[]>> {
  if (studentIds.length === 0) return new Map();
  const rows = await sql.many<{ student_id: string; user_id: string }>(
    `select sg.student_id, g.user_id from student_guardians sg
     join guardians g on g.id = sg.guardian_id
     join school_memberships m on m.user_id = g.user_id and m.school_id = g.school_id and m.role = 'parent' and m.status = 'active'
     where sg.student_id = any($1::uuid[]) and sg.verified_at is not null and g.user_id is not null`,
    [pgArray(studentIds)],
  );
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.student_id, [...(map.get(r.student_id) ?? []), r.user_id]);
  return map;
}

/** Guardian and student accounts for the given students (trusted lookup for fan-out). */
export async function familyUserIds(studentIds: string[]): Promise<Map<string, string[]>> {
  return withService(async (sql) => {
    const map = await guardianUserIds(sql, studentIds);
    const students = await sql.many<{ id: string; user_id: string }>(
      "select id, user_id from students where id = any($1::uuid[]) and user_id is not null",
      [pgArray(studentIds)],
    );
    for (const s of students) map.set(s.id, [...(map.get(s.id) ?? []), s.user_id]);
    return map;
  });
}
