import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireActionContext } from "@/lib/auth/context";
import { AppError, ForbiddenError } from "@/lib/errors";
import { storage, validateUpload } from "@/lib/storage";

const params = z.object({
  entity: z.enum(["assignment", "submission", "achievement"]),
  id: z.uuid(),
});

/**
 * Uploads one file and attaches it to an existing record. The caller must be
 * allowed to change that record: teachers for assignments, the student for
 * their own submission, staff/family for achievements.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireActionContext();
    const { entity, id } = params.parse(Object.fromEntries(request.nextUrl.searchParams));
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("No file received");
    const data = Buffer.from(await file.arrayBuffer());
    const problem = validateUpload(file.name, file.type, data);
    if (problem) throw new AppError(problem);

    const allowed = await ctx.db(async (sql) => {
      const check =
        entity === "assignment"
          ? "select app.can_grade_assignment($1) as ok"
          : entity === "submission"
            ? "select exists (select 1 from assignment_submissions s where s.id = $1 and app.is_student_self(s.student_id) and s.status = 'submitted') as ok"
            : "select exists (select 1 from student_achievements a where a.id = $1 and (app.has_role(a.school_id, 'school_admin') or app.teaches_student(a.student_id) or (app.is_family_of(a.student_id) and a.status = 'pending'))) as ok";
      return (await sql.one<{ ok: boolean }>(check, [id])).ok;
    });
    if (!allowed) throw new ForbiddenError();

    const safeName = path.basename(file.name).replace(/[^\w.\- ]/g, "_").slice(-120);
    const key = `${ctx.schoolId}/${entity}/${id}/${randomUUID()}${path.extname(safeName).toLowerCase()}`;
    await storage().put(key, data, file.type);
    const row = await ctx.db((sql) =>
      sql.one<{ id: string }>(
        `insert into file_objects (school_id, storage_path, file_name, content_type, size_bytes, entity_type, entity_id, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [ctx.schoolId, key, safeName, file.type, data.length, entity, id, ctx.userId],
      ),
    );
    return NextResponse.json({ id: row.id, name: safeName });
  } catch (error) {
    return apiError(error);
  }
}
