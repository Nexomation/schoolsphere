import "server-only";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../env";
import { withService } from "../db";
import { logger } from "../logger";
import { createToken, hashPassword, hashToken, passwordProblem, verifyPassword } from "./password";
import type { AuthProvider, SessionUser } from "./provider";

export const LOCAL_SESSION_COOKIE = "ss_session";
const SESSION_DAYS = 7;
const RESET_TOKEN_MINUTES = 30;

function secret() {
  return new TextEncoder().encode(env().AUTH_SECRET);
}

async function issueSession(userId: string) {
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const session = await withService((sql) =>
    sql.one<{ id: string }>(
      "insert into auth.sessions (user_id, expires_at, user_agent) values ($1, $2, $3) returning id",
      [userId, expires.toISOString(), userAgent],
    ),
  );
  await withService((sql) => sql.exec("update auth.users set last_sign_in_at = now() where id = $1", [userId]));
  const jwt = await new SignJWT({ sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secret());
  (await cookies()).set(LOCAL_SESSION_COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    expires,
  });
}

async function readSession(): Promise<{ userId: string; sessionId: string } | null> {
  const token = (await cookies()).get(LOCAL_SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}

// Simple per-process brute-force protection. A multi-instance deployment
// uses Supabase Auth, which has its own rate limits.
const failures = new Map<string, { count: number; until: number }>();
// Compared against when the email is unknown, so response time does not reveal which accounts exist.
let dummyHash: Promise<string> | undefined;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60_000;

export const localAuthProvider: AuthProvider = {
  kind: "local",

  async getSessionUser(): Promise<SessionUser | null> {
    const s = await readSession();
    if (!s) return null;
    const row = await withService((sql) =>
      sql.maybeOne<{ id: string; email: string }>(
        `select u.id, u.email from auth.sessions s join auth.users u on u.id = s.user_id
         where s.id = $1 and s.user_id = $2 and s.revoked_at is null and s.expires_at > now()
           and (u.banned_until is null or u.banned_until < now())`,
        [s.sessionId, s.userId],
      ),
    );
    return row;
  },

  async signInWithPassword(email, password) {
    const key = email.trim().toLowerCase();
    const f = failures.get(key);
    if (f && f.count >= MAX_FAILURES && f.until > Date.now()) {
      return { ok: false, error: "Too many attempts. Please wait 15 minutes and try again." };
    }
    const user = await withService((sql) =>
      sql.maybeOne<{ id: string; encrypted_password: string | null; banned_until: string | null }>(
        "select id, encrypted_password, banned_until from auth.users where lower(email) = $1",
        [key],
      ),
    );
    const valid = await verifyPassword(password, user?.encrypted_password ?? (await (dummyHash ??= hashPassword("not-a-real-password-0"))));
    if (!user || !valid || (user.banned_until && new Date(user.banned_until) > new Date())) {
      const next = { count: (f && f.until > Date.now() ? f.count : 0) + 1, until: Date.now() + LOCKOUT_MS };
      failures.set(key, next);
      return { ok: false, error: "Incorrect email or password." };
    }
    failures.delete(key);
    await issueSession(user.id);
    return { ok: true, userId: user.id };
  },

  async signInAsDemoUser(userId) {
    const config = env();
    if (!config.DEMO_MODE) throw new Error("Demo sign-in is disabled");
    // Only accounts created by the demo seed (flagged in metadata) qualify.
    const ok = await withService((sql) =>
      sql.maybeOne("select 1 from auth.users where id = $1 and raw_user_meta_data ->> 'demo' = 'true'", [userId]),
    );
    if (!ok) throw new Error("Not a demo account");
    await issueSession(userId);
  },

  async signOut() {
    const s = await readSession();
    if (s) {
      await withService((sql) => sql.exec("update auth.sessions set revoked_at = now() where id = $1", [s.sessionId]));
    }
    (await cookies()).delete(LOCAL_SESSION_COOKIE);
  },

  async requestPasswordReset(email) {
    const user = await withService((sql) =>
      sql.maybeOne<{ id: string }>("select id from auth.users where lower(email) = lower($1)", [email.trim()]),
    );
    if (!user) return; // do not reveal whether the account exists
    const { token, hash } = createToken();
    await withService((sql) =>
      sql.exec(
        `insert into auth.local_tokens (user_id, purpose, token_hash, expires_at)
         values ($1, 'password_reset', $2, now() + make_interval(mins => $3))`,
        [user.id, hash, RESET_TOKEN_MINUTES],
      ),
    );
    const link = `${env().APP_URL}/reset-password?token=${token}`;
    // No email provider in local mode: the link goes to the developer console only.
    logger.info("Local auth password reset link (development only)", { email, link });
  },

  async completePasswordReset({ token, password }) {
    const problem = passwordProblem(password);
    if (problem) return { ok: false, error: problem };
    if (!token) return { ok: false, error: "This reset link is invalid." };
    const hash = await hashPassword(password);
    const done = await withService(async (sql) => {
      const row = await sql.maybeOne<{ id: string; user_id: string }>(
        `update auth.local_tokens set used_at = now()
         where token_hash = $1 and purpose = 'password_reset' and used_at is null and expires_at > now()
         returning id, user_id`,
        [hashToken(token)],
      );
      if (!row) return false;
      await sql.exec("update auth.users set encrypted_password = $2, updated_at = now() where id = $1", [row.user_id, hash]);
      // Sign out every existing session after a reset.
      await sql.exec("update auth.sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [row.user_id]);
      return true;
    });
    return done ? { ok: true } : { ok: false, error: "This reset link is invalid or has expired." };
  },

  async changePassword(userId, currentPassword, newPassword) {
    const problem = passwordProblem(newPassword);
    if (problem) return { ok: false, error: problem };
    const user = await withService((sql) =>
      sql.one<{ encrypted_password: string | null }>("select encrypted_password from auth.users where id = $1", [userId]),
    );
    if (!(await verifyPassword(currentPassword, user.encrypted_password))) {
      return { ok: false, error: "Your current password is incorrect." };
    }
    const hash = await hashPassword(newPassword);
    await withService((sql) => sql.exec("update auth.users set encrypted_password = $2, updated_at = now() where id = $1", [userId, hash]));
    return { ok: true };
  },

  async createUser({ email, password, fullName }) {
    const problem = passwordProblem(password);
    if (problem) return { ok: false, error: problem };
    const hash = await hashPassword(password);
    const existing = await withService((sql) =>
      sql.maybeOne("select 1 from auth.users where lower(email) = lower($1)", [email]),
    );
    if (existing) return { ok: false, error: "An account with this email already exists. Sign in instead." };
    const row = await withService((sql) =>
      sql.one<{ id: string }>(
        `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
         values ($1, $2, now(), $3::jsonb) returning id`,
        [email.trim().toLowerCase(), hash, JSON.stringify({ full_name: fullName })],
      ),
    );
    return { ok: true, userId: row.id };
  },
};
