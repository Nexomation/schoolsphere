import { NextResponse, type NextRequest } from "next/server";
import { exchangeSupabaseCode } from "@/lib/auth/supabase-provider";
import { env } from "@/lib/env";

/** Supabase email links (password recovery) land here with a one-time code. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/app";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app";
  if (env().AUTH_PROVIDER !== "supabase" || !code) {
    return NextResponse.redirect(new URL("/login", env().APP_URL));
  }
  const ok = await exchangeSupabaseCode(code);
  return NextResponse.redirect(new URL(ok ? next : "/login?error=link", env().APP_URL));
}
