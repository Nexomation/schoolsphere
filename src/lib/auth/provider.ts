import "server-only";
import { env } from "../env";
import { localAuthProvider } from "./local-provider";
import { supabaseAuthProvider } from "./supabase-provider";

export type SessionUser = { id: string; email: string };

export type SignInResult = { ok: true; userId: string } | { ok: false; error: string };

/**
 * Authentication boundary. The rest of the app only sees this interface.
 *
 *  - "supabase": Supabase Auth (production). Passwords, sessions, password
 *    reset emails and token refresh are handled by Supabase.
 *  - "local": a self-contained provider for local development and tests that
 *    stores scrypt password hashes in a local `auth.users` table and issues
 *    signed, server-revocable session cookies. Refuses to run in production
 *    unless explicitly allowed (see README).
 */
export interface AuthProvider {
  readonly kind: "local" | "supabase";
  /** The verified user for this request, or null. */
  getSessionUser(): Promise<SessionUser | null>;
  signInWithPassword(email: string, password: string): Promise<SignInResult>;
  /** Local + DEMO_MODE only: start a session for a seeded demo account without a password. */
  signInAsDemoUser?(userId: string): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Starts a password reset. Never reveals whether the email exists. In local
   * mode the link is printed to the server console (no email provider).
   */
  requestPasswordReset(email: string): Promise<void>;
  /** Completes a reset. Local mode passes the emailed token; Supabase uses the recovery session. */
  completePasswordReset(input: { token?: string; password: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Server-side account creation, used when an invitation is accepted. */
  createUser(input: { email: string; password: string; fullName: string }): Promise<{ ok: true; userId: string } | { ok: false; error: string }>;
}

export function getAuthProvider(): AuthProvider {
  const config = env();
  if (config.AUTH_PROVIDER === "supabase") return supabaseAuthProvider;
  if (config.NODE_ENV === "production" && !config.ALLOW_LOCAL_AUTH_IN_PRODUCTION) {
    throw new Error(
      "AUTH_PROVIDER=local is for development only. Configure Supabase Auth for production " +
        "(or set ALLOW_LOCAL_AUTH_IN_PRODUCTION=true to run a production build of the local demo).",
    );
  }
  return localAuthProvider;
}
