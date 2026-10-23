/**
 * Database CLI.
 *
 *   npm run db:migrate   apply pending migrations
 *   npm run db:seed      load the two demo schools (development only)
 *   npm run db:reset     PGlite only: delete the local database, migrate and seed
 *
 * Stop `npm run dev` before running these against the local PGlite database:
 * two processes must never open the same PGlite data directory at once.
 */
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { env } = await import("../src/lib/env");
const { createPgliteDatabase, createPostgresDatabase } = await import("../src/lib/db/drivers");
const { applyMigrations } = await import("../src/lib/db/migrate");
const { seedDemo } = await import("../src/lib/seed/demo");
const { hashPassword } = await import("../src/lib/auth/password");

const command = process.argv[2];
const config = env();

async function open() {
  return config.DB_DRIVER === "postgres"
    ? createPostgresDatabase(config.DATABASE_URL!)
    : createPgliteDatabase(path.resolve(config.PGLITE_DATA_DIR));
}

async function seed() {
  if (config.NODE_ENV === "production") throw new Error("Refusing to seed demo data with NODE_ENV=production");
  const db = await open();
  const password = process.env.DEMO_USER_PASSWORD || randomBytes(9).toString("base64url") + "7a";
  try {
    const existing = await db.transaction((sql) =>
      sql.one<{ n: number }>("select count(*)::int as n from public.schools where is_demo"),
    );
    if (existing.n > 0) {
      console.log("Demo schools already exist; nothing to do. Use `npm run db:reset` to start over (PGlite).");
      return;
    }
    let summary: Awaited<ReturnType<typeof seedDemo>>;
    if (config.AUTH_PROVIDER === "supabase") {
      // Supabase Auth owns the users table: create accounts through the Admin API.
      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient(config.NEXT_PUBLIC_SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      summary = await db.transaction((sql) =>
        seedDemo(sql, async ({ email, fullName }) => {
          const { data, error } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          });
          if (error || !data.user) throw new Error(`Could not create ${email}: ${error?.message}`);
          await sql.exec("insert into public.user_profiles (id, full_name, email) values ($1, $2, $3)", [data.user.id, fullName, email]);
          return data.user.id;
        }),
      );
    } else {
      const hash = await hashPassword(password);
      summary = await db.transaction((sql) =>
        seedDemo(sql, async ({ email, fullName }) => {
          const user = await sql.one<{ id: string }>(
            `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
             values ($1, $2, now(), $3::jsonb) returning id`,
            [email, hash, JSON.stringify({ full_name: fullName, demo: true })],
          );
          await sql.exec("insert into public.user_profiles (id, full_name, email) values ($1, $2, $3)", [user.id, fullName, email]);
          return user.id;
        }),
      );
    }
    console.log(`\nSeeded ${summary.schools.length} demo schools:`);
    for (const s of summary.schools) console.log(`  - ${s.name} (${s.slug})`);
    console.log(`\n${summary.accounts.length} demo accounts (all use the same development password):`);
    for (const a of summary.accounts) console.log(`  ${a.role.padEnd(22)} ${a.email.padEnd(40)} ${a.school ?? "platform"}`);
    if (process.env.DEMO_USER_PASSWORD) {
      console.log("\nPassword: the value of DEMO_USER_PASSWORD in your .env.local");
    } else {
      console.log(`\nGenerated development password: ${password}`);
      console.log("Set DEMO_USER_PASSWORD in .env.local before seeding to choose your own.");
    }
    if (config.DEMO_MODE && config.AUTH_PROVIDER === "local") {
      console.log("DEMO_MODE is on: the login page also offers one-click demo sign-in.");
    }
  } finally {
    await db.close();
  }
}

async function migrate() {
  const db = await open();
  try {
    const result = await applyMigrations(db, (m) => console.log(m));
    console.log(result.applied.length ? `Applied ${result.applied.length} migration(s).` : "Database is up to date.");
  } finally {
    await db.close();
  }
}

switch (command) {
  case "migrate":
    await migrate();
    break;
  case "seed":
    await seed();
    break;
  case "reset": {
    if (config.DB_DRIVER !== "pglite") throw new Error("db:reset only supports the local PGlite database");
    await rm(path.resolve(config.PGLITE_DATA_DIR), { recursive: true, force: true });
    console.log(`Deleted ${config.PGLITE_DATA_DIR}`);
    await migrate();
    await seed();
    break;
  }
  default:
    console.log("Usage: tsx scripts/db.mts <migrate|seed|reset>");
    process.exit(1);
}
