import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";
import { passwordProblem } from "./password";
import type { AuthProvider } from "./provider";

/** Request-scoped Supabase client bound to the user's auth cookies (anon key only). */
async function serverClient() {
  const config = env();
  const store = await cookies();
  return createServerClient(config.NEXT_PUBLIC_SUPABASE_URL!, config.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there. The
          // proxy refreshes sessions, so this is safe to ignore.
        }
      },
    },
  });
}

/** Service-role client. Server only; never sent to the browser. */
function adminClient() {
  const config = env();
  return createClient(config.NEXT_PUBLIC_SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const supabaseAuthProvider: AuthProvider = {
  kind: "supabase",

  async getSessionUser() {
    const supabase = await serverClient();
    // getUser() validates the token with Supabase Auth; never trust getSession() alone on the server.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email) return null;
    return { id: data.user.id, email: data.user.email };
  },

  async signInWithPassword(email, password) {
    const supabase = await serverClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) return { ok: false, error: "Incorrect email or password." };
    return { ok: true, userId: data.user.id };
  },

  async signOut() {
    const supabase = await serverClient();
    await supabase.auth.signOut();
  },

  async requestPasswordReset(email) {
    const supabase = await serverClient();
    // Supabase emails a link to /auth/callback, which exchanges the code for a
    // recovery session and forwards to /reset-password.
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${env().APP_URL}/auth/callback?next=/reset-password`,
    });
  },

  async completePasswordReset({ password }) {
    const problem = passwordProblem(password);
    if (problem) return { ok: false, error: problem };
    const supabase = await serverClient();
    const { error } = await supabase.auth.updateUser({ password });
    return error ? { ok: false, error: "This reset link is invalid or has expired." } : { ok: true };
  },

  async changePassword(_userId, currentPassword, newPassword) {
    const problem = passwordProblem(newPassword);
    if (problem) return { ok: false, error: problem };
    const supabase = await serverClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user?.email) return { ok: false, error: "Please sign in again." };
    const check = await supabase.auth.signInWithPassword({ email: data.user.email, password: currentPassword });
    if (check.error) return { ok: false, error: "Your current password is incorrect." };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  async createUser({ email, password, fullName }) {
    const problem = passwordProblem(password);
    if (problem) return { ok: false, error: problem };
    const { data, error } = await adminClient().auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      // The invitation link was delivered to this address, which proves ownership.
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) {
      return { ok: false, error: error?.message.includes("already") ? "An account with this email already exists. Sign in instead." : "Could not create the account." };
    }
    return { ok: true, userId: data.user.id };
  },
};

/** Used by /auth/callback to finish Supabase email links (password recovery). */
export async function exchangeSupabaseCode(code: string) {
  const supabase = await serverClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return !error;
}
