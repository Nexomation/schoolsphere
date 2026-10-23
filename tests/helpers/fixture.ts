import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPgliteDatabase } from "../../src/lib/db/drivers";
import { setDatabaseForTesting } from "../../src/lib/db";
import type { Database, Sql } from "../../src/lib/db/types";

export const FIXTURE_PATH = path.resolve(__dirname, "../../.data/test-fixture.tar.gz");
/** Seed data is generated relative to this fixed date so tests are deterministic. */
export const FIXTURE_TODAY = "2026-10-22";
/** Test-only password for the seeded accounts (never used outside the test database). */
export const TEST_PASSWORD = "fixture-password-123";

export type TestDb = {
  db: Database;
  /** Runs fn as the given demo user, with RLS enforced exactly like the app. */
  as<T>(email: string, fn: (sql: Sql) => Promise<T>): Promise<T>;
  /** Trusted context (no RLS). */
  service<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  userId(email: string): Promise<string>;
  close(): Promise<void>;
};

/** Restores a private copy of the seeded fixture database. */
export async function openTestDb(): Promise<TestDb> {
  const db = await createPgliteDatabase(undefined, new Blob([await readFile(FIXTURE_PATH)]));
  setDatabaseForTesting(db);

  const ids = new Map<string, string>();
  const userId = async (email: string) => {
    if (!ids.has(email)) {
      const row = await db.transaction((sql) => sql.one<{ id: string }>("select id from auth.users where email = $1", [email]));
      ids.set(email, row.id);
    }
    return ids.get(email)!;
  };

  return {
    db,
    userId,
    async as(email, fn) {
      const id = await userId(email);
      return db.transaction(async (sql) => {
        await sql.exec("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
        await sql.exec("set local role authenticated");
        return fn(sql);
      });
    },
    service: (fn) => db.transaction(fn),
    async close() {
      setDatabaseForTesting(undefined);
      await db.close();
    },
  };
}

export const EMAILS = {
  platform: "platform@schoolsphere.test",
  svm: {
    admin: "admin.svm@schoolsphere.test",
    accounts: "accounts.svm@schoolsphere.test",
    teacher1: "teacher1.svm@schoolsphere.test",
    teacher2: "teacher2.svm@schoolsphere.test",
    parent: "parent.svm@schoolsphere.test",
    parent2: "parent2.svm@schoolsphere.test",
    student: "student.svm@schoolsphere.test",
    transport: "transport.svm@schoolsphere.test",
    driver1: "driver1.svm@schoolsphere.test",
    driver2: "driver2.svm@schoolsphere.test",
  },
  gvp: {
    admin: "admin.gvp@schoolsphere.test",
    accounts: "accounts.gvp@schoolsphere.test",
    teacher1: "teacher1.gvp@schoolsphere.test",
    parent: "parent.gvp@schoolsphere.test",
    student: "student.gvp@schoolsphere.test",
    driver1: "driver1.gvp@schoolsphere.test",
  },
} as const;
