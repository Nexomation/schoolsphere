import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, fromDatabaseError } from "./errors";
import { logger } from "./logger";

const STATUS: Record<AppError["code"], number> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unavailable: 503,
};

/** Consistent JSON errors for route handlers; never leaks internals. */
export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  const app = error instanceof AppError ? error : fromDatabaseError(error);
  if (app) return NextResponse.json({ error: app.message }, { status: STATUS[app.code] });
  logger.error("Unhandled API error", { error });
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
