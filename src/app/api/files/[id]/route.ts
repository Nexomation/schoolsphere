import { type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireActionContext } from "@/lib/auth/context";
import { NotFoundError } from "@/lib/errors";
import { storage } from "@/lib/storage";

/**
 * Downloads a file. The metadata row is read with the user's RLS scope, so a
 * file id from another school or another family returns 404 (no IDOR).
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/api/files/[id]">) {
  try {
    const ctx = await requireActionContext();
    const id = z.uuid().parse((await params).id);
    const meta = await ctx.db((sql) =>
      sql.maybeOne<{ storage_path: string; file_name: string; content_type: string }>(
        "select storage_path, file_name, content_type from file_objects where id = $1",
        [id],
      ),
    );
    if (!meta) throw new NotFoundError();
    const data = await storage().get(meta.storage_path);
    const inline = meta.content_type.startsWith("image/") || meta.content_type === "application/pdf";
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": meta.content_type,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${meta.file_name.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
