/**
 * Development helper: issues local-auth session cookies for demo accounts so
 * pages can be smoke-tested with curl or Playwright without a browser login.
 *
 *   npx tsx scripts/dev-sessions.mts <output.json>
 *
 * Refuses to run unless AUTH_PROVIDER=local and DEMO_MODE=true, and only for
 * accounts the demo seed created. Stop `npm run dev` first (PGlite is single-process).
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { SignJWT } from "jose";

nextEnv.loadEnvConfig(process.cwd());
const { env } = await import("../src/lib/env");
const { createPgliteDatabase } = await import("../src/lib/db/drivers");

const config = env();
if (config.AUTH_PROVIDER !== "local" || !config.DEMO_MODE || config.NODE_ENV === "production") {
  throw new Error("dev-sessions only works with AUTH_PROVIDER=local and DEMO_MODE=true outside production");
}
const out = process.argv[2];
if (!out) throw new Error("Usage: tsx scripts/dev-sessions.mts <output.json>");

const db = await createPgliteDatabase(path.resolve(config.PGLITE_DATA_DIR));
const users = await db.transaction((sql) =>
  sql.many<{ id: string; email: string }>("select id, email from auth.users where raw_user_meta_data ->> 'demo' = 'true' order by email"),
);
const secret = new TextEncoder().encode(config.AUTH_SECRET);
const cookies: Record<string, string> = {};
for (const u of users) {
  const expires = new Date(Date.now() + 86_400_000);
  const s = await db.transaction((sql) =>
    sql.one<{ id: string }>("insert into auth.sessions (user_id, expires_at, user_agent) values ($1, $2, 'dev-sessions') returning id", [u.id, expires.toISOString()]),
  );
  cookies[u.email] = await new SignJWT({ sid: s.id }).setProtectedHeader({ alg: "HS256" }).setSubject(u.id).setIssuedAt().setExpirationTime(expires).sign(secret);
}
await db.close();
await writeFile(out, JSON.stringify(cookies, null, 2));
console.log(`Wrote ${Object.keys(cookies).length} session cookies to ${out}`);
