import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z, ZodError } from "zod";
import { AppError, fromDatabaseError } from "./errors";
import { logger } from "./logger";

export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T = null>(data: T = null as T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

/** Validates untrusted action input. Field errors are returned to the form. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  return schema.parse(input);
}

/**
 * Boundary for every server action: authorization errors, validation errors
 * and database constraint violations become safe messages; anything else is
 * logged and replaced with a generic message.
 */
export async function runAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    unstable_rethrow(error); // let redirect()/notFound() through
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const key = issue.path.join(".");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { ok: false, error: error.issues[0]?.message ?? "Please check the form for errors.", fieldErrors };
    }
    if (error instanceof AppError) return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
    const dbError = fromDatabaseError(error);
    if (dbError) {
      logger.warn("Action rejected by database", { code: (error as { code?: string }).code, message: (error as Error).message });
      return { ok: false, error: dbError.message };
    }
    logger.error("Unhandled action error", { error });
    return { ok: false, error: "Something went wrong. Please try again, and contact support if it keeps happening." };
  }
}
