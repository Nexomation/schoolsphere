import "server-only";
import { z } from "zod";
import { withService } from "../db";
import type { Sql } from "../db/types";
import { AppError } from "../errors";

export const announcementInput = z
  .object({
    title: z.string().trim().min(3, "Add a title").max(200),
    body: z.string().trim().min(1, "Write the announcement").max(10000),
    audience: z.enum(["all", "staff", "parents", "students", "section"]),
    sectionId: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || null),
    priority: z.enum(["normal", "important", "urgent"]),
    publish: z.boolean().default(true),
    isAiAssisted: z.boolean().default(false),
  })
  .refine((v) => (v.audience === "section") === !!v.sectionId, { path: ["sectionId"], message: "Choose the section" });

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  audience: string;
  section_label: string | null;
  priority: string;
  status: string;
  published_at: string | null;
  is_ai_assisted: boolean;
  author: string | null;
  created_by: string | null;
};

export async function listAnnouncements(sql: Sql, schoolId: string): Promise<AnnouncementRow[]> {
  return sql.many<AnnouncementRow>(
    `select a.id, a.title, a.body, a.audience, c.name || ' ' || sec.name as section_label, a.priority, a.status, a.published_at, a.is_ai_assisted,
            p.full_name as author, a.created_by
     from announcements a left join sections sec on sec.id = a.section_id left join classes c on c.id = sec.class_id
     left join user_profiles p on p.id = a.created_by
     where a.school_id = $1 and a.status <> 'archived'
     order by coalesce(a.published_at, a.created_at) desc limit 200`,
    [schoolId],
  );
}

export async function createAnnouncement(sql: Sql, schoolId: string, userId: string, input: z.output<typeof announcementInput>) {
  return (
    await sql.one<{ id: string }>(
      `insert into announcements (school_id, title, body, audience, section_id, priority, status, published_at, is_ai_assisted, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [schoolId, input.title, input.body, input.audience, input.sectionId, input.priority, input.publish ? "published" : "draft", input.publish ? new Date().toISOString() : null, input.isAiAssisted, userId],
    )
  ).id;
}

export async function setAnnouncementStatus(sql: Sql, schoolId: string, id: string, status: "published" | "archived") {
  const rows = await sql.many(
    `update announcements set status = $3, published_at = coalesce(published_at, case when $3 = 'published' then now() end)
     where id = $1 and school_id = $2 returning id`,
    [id, schoolId, status],
  );
  if (!rows.length) throw new AppError("Announcement not found", "not_found");
}

/** Who should be notified for an announcement (trusted lookup; the author was authorized to publish to this audience). */
export async function audienceUserIds(schoolId: string, audience: string, sectionId: string | null): Promise<string[]> {
  return withService(async (sql) => {
    const roles: Record<string, string[]> = {
      all: ["school_admin", "accountant", "teacher", "parent", "student", "transport_coordinator", "driver"],
      staff: ["school_admin", "accountant", "teacher", "transport_coordinator", "driver"],
      parents: ["parent"],
      students: ["student"],
    };
    if (audience !== "section") {
      return (
        await sql.many<{ user_id: string }>(
          "select distinct user_id from school_memberships where school_id = $1 and status = 'active' and role::text = any($2::text[])",
          [schoolId, `{${roles[audience].join(",")}}`],
        )
      ).map((r) => r.user_id);
    }
    return (
      await sql.many<{ user_id: string }>(
        `select g.user_id from enrollments e join student_guardians sg on sg.student_id = e.student_id and sg.verified_at is not null
         join guardians g on g.id = sg.guardian_id where e.section_id = $1 and e.status = 'active' and g.user_id is not null
         union select s.user_id from enrollments e join students s on s.id = e.student_id where e.section_id = $1 and e.status = 'active' and s.user_id is not null
         union select st.user_id from teacher_assignments ta join staff st on st.id = ta.staff_id where ta.section_id = $1 and st.user_id is not null`,
        [sectionId],
      )
    ).map((r) => r.user_id);
  });
}
