import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Runs before /app and /platform routes.
 *  - Redirects visitors without a session cookie to /login (fast path; the
 *    real session check happens on the server for every request).
 *  - In Supabase mode, refreshes the auth session so cookies stay valid.
 */
export async function proxy(request: NextRequest) {
  const provider = process.env.AUTH_PROVIDER ?? "local";
  let response = NextResponse.next({ request });

  let hasSession = false;
  if (provider === "supabase" && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    hasSession = !!data.user;
  } else {
    hasSession = request.cookies.has("ss_session");
  }

  if (!hasSession) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/platform/:path*"],
};
