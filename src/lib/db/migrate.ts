import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Database } from "./types";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const COMPAT_FILE = path.join(ROOT, "db", "local", "00_supabase_compat.sql");

export type MigrationResult = { applied: string[]; skipped: string[]; compatApplied: boolean };

/**
 * Applies pending migrations in filename order, each in its own transaction.
 * When the target has no Supabase `auth` schema (PGlite, plain Postgres) the
 * local compatibility layer is applied first.
 */
export async function applyMigrations(db: Database, log: (msg: string) => void = () => {}): Promise<MigrationResult> {
  let compatApplied = false;
  const hasAuth = await db.transaction((sql) =>
    sql.one<{ exists: boolean }>("select to_regclass('auth.users') is not null as exists"),
  );
  if (!hasAuth.exists) {
    log("No Supabase auth schema found; applying local compatibility layer");
    await db.execScript(await readFile(COMPAT_FILE, "utf8"));
    compatApplied = true;
  }

  await db.execScript(`
    create schema if not exists ss_meta;
    create table if not exists ss_meta.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set(
    (
      await db.transaction((sql) => sql.many<{ name: string }>("select name from ss_meta.schema_migrations"))
    ).map((r) => r.name),
  );

  const applied: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (done.has(file)) {
      skipped.push(file);
      continue;
    }
    const script = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    log(`Applying ${file}`);
    await db.execScript(`begin;\n${script}\ninsert into ss_meta.schema_migrations (name) values ('${file}');\ncommit;`);
    applied.push(file);
  }
  return { applied, skipped, compatApplied };
}
