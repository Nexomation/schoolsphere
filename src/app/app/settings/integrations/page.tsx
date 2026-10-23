import type { Metadata } from "next";
import { CheckCircle2, CircleDashed, FlaskConical } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { aiStatus } from "@/lib/ai/provider";
import { env } from "@/lib/env";
import { channelStatus } from "@/lib/notifications/channels";

export const metadata: Metadata = { title: "Integrations" };

type Row = { name: string; state: "on" | "off" | "dev"; detail: string; setup?: string };

/** Honest status of every external service; nothing here claims a connection that does not exist. */
export default async function IntegrationsPage() {
  await requirePageContext("settings.manage");
  const config = env();
  const ai = aiStatus();
  const channels = channelStatus();
  const rows: Row[] = [
    {
      name: "Database",
      state: config.DB_DRIVER === "postgres" ? "on" : "dev",
      detail: config.DB_DRIVER === "postgres" ? "PostgreSQL via DATABASE_URL (Supabase in production)." : "Local PGlite database in .data/pglite (development only).",
    },
    {
      name: "Authentication",
      state: config.AUTH_PROVIDER === "supabase" ? "on" : "dev",
      detail: config.AUTH_PROVIDER === "supabase" ? "Supabase Auth." : "Local development sign-in. Password-reset links are printed to the server console.",
      setup: config.AUTH_PROVIDER === "local" ? "Set AUTH_PROVIDER=supabase with the Supabase URL and keys." : undefined,
    },
    { name: "File storage", state: config.STORAGE_DRIVER === "supabase" ? "on" : "dev", detail: config.STORAGE_DRIVER === "supabase" ? `Supabase Storage bucket "${config.SUPABASE_STORAGE_BUCKET}".` : "Local folder .data/uploads (development only)." },
    {
      name: "Online fee payments",
      state: config.PAYMENTS_PROVIDER === "razorpay" ? "on" : config.PAYMENTS_SANDBOX_ENABLED ? "dev" : "off",
      detail:
        config.PAYMENTS_PROVIDER === "razorpay"
          ? "Razorpay configured. Webhook endpoint: /api/payments/webhook/razorpay."
          : config.PAYMENTS_SANDBOX_ENABLED
            ? "Sandbox only, for demo schools. Real schools cannot pay online until Razorpay is configured."
            : "Not configured. Parents pay at the school office.",
      setup: config.PAYMENTS_PROVIDER !== "razorpay" ? "Set PAYMENTS_PROVIDER=razorpay, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET." : undefined,
    },
    {
      name: "AI assistant",
      state: ai.configured ? "on" : "off",
      detail: ai.configured ? `${ai.provider} (${ai.model}).` : "Not configured; the assistant uses templates built from school records.",
      setup: ai.configured ? undefined : "Set AI_PROVIDER=anthropic and ANTHROPIC_API_KEY (or openai + OPENAI_API_KEY).",
    },
    ...channels.map((c) => ({
      name: c.channel === "email" ? "Email notifications" : c.channel === "whatsapp" ? "WhatsApp notifications" : "Push notifications",
      state: (c.sendingEnabled ? "on" : "off") as Row["state"],
      detail: c.sendingEnabled ? `${c.provider} — sending enabled.` : c.configured ? `${c.provider} configured, but NOTIFICATIONS_EXTERNAL_ENABLED is off, so nothing is sent.` : `${c.provider} not configured. In-app notifications still work.`,
    })),
    { name: "Maps", state: "on", detail: `Tiles from ${new URL(config.MAP_TILE_URL.replace(/\{[a-z]\}/g, "a")).hostname}. Use a commercial tile provider for heavy production use.` },
    {
      name: "Live location",
      state: config.TRANSPORT_SIMULATOR_ENABLED ? "dev" : "on",
      detail: `Driver phones and GPS trackers post to /api/transport/telemetry.${config.TRANSPORT_SIMULATOR_ENABLED ? " The development simulator is enabled (simulated trips are labelled)." : ""}`,
    },
  ];
  return (
    <>
      <PageHeader title="Integrations" description="What this installation is connected to. Configuration lives in server environment variables, never in the browser." />
      <Card>
        <CardContent className="divide-y p-0">
          {rows.map((r) => (
            <div key={r.name} className="flex items-start gap-3 p-4">
              {r.state === "on" ? <CheckCircle2 className="mt-0.5 size-5 text-success" aria-hidden /> : r.state === "dev" ? <FlaskConical className="mt-0.5 size-5 text-warning" aria-hidden /> : <CircleDashed className="mt-0.5 size-5 text-muted-foreground" aria-hidden />}
              <div className="text-sm">
                <p className="font-medium">
                  {r.name} <span className="text-xs font-normal text-muted-foreground">({r.state === "on" ? "connected" : r.state === "dev" ? "development mode" : "not configured"})</span>
                </p>
                <p className="text-muted-foreground">{r.detail}</p>
                {r.setup && <p className="mt-1 text-xs">{r.setup}</p>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
