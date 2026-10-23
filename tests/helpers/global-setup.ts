import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPgliteDatabase } from "../../src/lib/db/drivers";
import { applyMigrations } from "../../src/lib/db/migrate";
import { seedDemo } from "../../src/lib/seed/demo";
import { hashPassword } from "../../src/lib/auth/password";
import { FIXTURE_PATH, FIXTURE_TODAY, TEST_PASSWORD } from "./fixture";

/**
 * Builds the migrated + seeded database once per test run and saves it as a
 * PGlite data-dir dump. Each test file restores its own private copy from it.
 */
export default async function setup() {
  const db = await createPgliteDatabase();
  await applyMigrations(db);
  const hash = await hashPassword(TEST_PASSWORD);
  await db.transaction((sql) =>
    seedDemo(
      sql,
      async ({ email, fullName }) => {
        const u = await sql.one<{ id: string }>(
          "insert into auth.users (email, encrypted_password, email_confirmed_at) values ($1, $2, now()) returning id",
          [email, hash],
        );
        await sql.exec("insert into public.user_profiles (id, full_name, email) values ($1, $2, $3)", [u.id, fullName, email]);
        return u.id;
      },
      { today: FIXTURE_TODAY },
    ),
  );
  const dump = await db.pglite.dumpDataDir("gzip");
  await mkdir(path.dirname(FIXTURE_PATH), { recursive: true });
  await writeFile(FIXTURE_PATH, Buffer.from(await dump.arrayBuffer()));
  await db.close();
}
