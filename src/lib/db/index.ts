import path from "node:path";
import { env } from "../env";
import { createPgliteDatabase, createPostgresDatabase } from "./drivers";
import type { Database, Sql } from "./types";

export type { Database, Sql } from "./types";
export { pgArray } from "./types";

// One database handle per server process. Stored on globalThis so Next.js
// hot reloads in development do not open a second PGlite instance on the same
// data directory (which would corrupt it).
const globalForDb = globalThis as unknown as { __schoolsphereDb?: Promise<Database> };

export function getDatabase(): Promise<Database> {
  if (!globalForDb.__schoolsphereDb) {
    const config = env();
    globalForDb.__schoolsphereDb =
      config.DB_DRIVER === "postgres"
        ? createPostgresDatabase(config.DATABASE_URL!)
        : createPgliteDatabase(path.resolve(/*turbopackIgnore: true*/ process.cwd(), config.PGLITE_DATA_DIR));
    globalForDb.__schoolsphereDb.catch(() => {
      globalForDb.__schoolsphereDb = undefined;
    });
  }
  return globalForDb.__schoolsphereDb;
}

/** Test helper: use a specific database instance (for example an in-memory PGlite). */
export function setDatabaseForTesting(db: Database | undefined) {
  globalForDb.__schoolsphereDb = db ? Promise.resolve(db) : undefined;
}

export type UserScope = {
  userId: string;
  /** Recorded on audit log rows for this transaction (e.g. attendance corrections). */
  reason?: string;
};

/**
 * Runs `fn` as the signed-in user. PostgreSQL Row Level Security applies to
 * every statement, exactly as for a Supabase client using the user's JWT.
 * This is the default for all request handling.
 */
export async function withUser<T>(scope: UserScope, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const db = await getDatabase();
  return db.transaction(async (sql) => {
    await sql.exec("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: scope.userId, role: "authenticated" }),
    ]);
    if (scope.reason) {
      await sql.exec("select set_config('app.change_reason', $1, true)", [scope.reason]);
    }
    await sql.exec("set local role authenticated");
    return fn(sql);
  });
}

/**
 * Runs `fn` with owner privileges, bypassing RLS. Only for trusted server
 * work that has already been authorized in code or has no user: provider
 * webhooks, device telemetry, invitation acceptance, notification fan-out,
 * onboarding and seeding. Every call site should explain why it needs this.
 */
export async function withService<T>(
  fn: (sql: Sql) => Promise<T>,
  opts: { actorUserId?: string; reason?: string } = {},
): Promise<T> {
  const db = await getDatabase();
  return db.transaction(async (sql) => {
    if (opts.actorUserId) await sql.exec("select set_config('app.actor_id', $1, true)", [opts.actorUserId]);
    if (opts.reason) await sql.exec("select set_config('app.change_reason', $1, true)", [opts.reason]);
    return fn(sql);
  });
}
