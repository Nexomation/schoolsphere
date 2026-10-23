/**
 * Application errors carry a safe, user-facing message. Anything else that
 * reaches an action boundary is logged and replaced by a generic message so
 * internal details (SQL, stack traces) never reach the browser.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: "bad_request" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "unavailable" = "bad_request",
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested record was not found or you do not have access to it.") {
    super(message, "not_found");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, "forbidden");
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super(message, "unauthenticated");
  }
}

type PgLikeError = { code?: string; message?: string; detail?: string; constraint?: string; constraint_name?: string };

/** Translates PostgreSQL errors (RLS denials, constraint violations) into AppErrors. */
export function fromDatabaseError(error: unknown): AppError | null {
  if (!error || typeof error !== "object") return null;
  const e = error as PgLikeError;
  const constraint = e.constraint ?? e.constraint_name;
  switch (e.code) {
    case "42501":
      // Raised by RLS ("new row violates row-level security policy") and by our guard triggers.
      return new ForbiddenError(
        e.message && !e.message.includes("row-level security") && !e.message.includes("permission denied")
          ? e.message
          : undefined,
      );
    case "23505":
      return new AppError(
        constraint ? `A record with the same details already exists (${humanizeConstraint(constraint)}).` : "This record already exists.",
        "conflict",
      );
    case "23514":
      return new AppError(e.message?.startsWith("new row") ? "Some values are not valid." : (e.message ?? "Some values are not valid."));
    case "23503":
      return new AppError("This record is linked to other records and cannot be changed that way.", "conflict");
    case "22P02":
    case "22007":
    case "22008":
      return new AppError("One of the values has an invalid format.");
    default:
      return null;
  }
}

function humanizeConstraint(name: string) {
  return name.replace(/_key$|_idx$/, "").replace(/_/g, " ");
}
