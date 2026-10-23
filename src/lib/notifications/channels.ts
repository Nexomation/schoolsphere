import "server-only";
import { env } from "../env";
import { pgArray, withService } from "../db";
import { logger } from "../logger";

/**
 * External notification channels. In-app notifications always work; these
 * are optional and OFF unless all of the following hold:
 *   1. NOTIFICATIONS_EXTERNAL_ENABLED=true (never on by default, so a
 *      development database can never message real people),
 *   2. the channel's provider is configured with credentials, and
 *   3. the recipient opted in for that notification type and channel.
 * Every attempt is recorded in notification_deliveries.
 */
export type ChannelName = "email" | "push" | "whatsapp";

export type OutboundMessage = { to: string; title: string; body: string; link?: string };

export interface ChannelProvider {
  readonly channel: ChannelName;
  readonly name: string;
  configured(): boolean;
  send(message: OutboundMessage): Promise<{ id?: string }>;
}

const resendEmail: ChannelProvider = {
  channel: "email",
  name: "Resend",
  configured: () => env().EMAIL_PROVIDER === "resend" && !!env().RESEND_API_KEY && !!env().EMAIL_FROM,
  async send(m) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env().RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env().EMAIL_FROM,
        to: [m.to],
        subject: m.title,
        text: `${m.body}${m.link ? `\n\nOpen: ${env().APP_URL}${m.link}` : ""}`,
      }),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
    const json = (await res.json()) as { id?: string };
    return { id: json.id };
  },
};

/**
 * WhatsApp Business Cloud API. Business-initiated messages must use a
 * pre-approved template; this expects a template named
 * `schoolsphere_update` with two body parameters (title, message).
 */
const metaWhatsApp: ChannelProvider = {
  channel: "whatsapp",
  name: "WhatsApp Business (Meta Cloud API)",
  configured: () => env().WHATSAPP_PROVIDER === "meta" && !!env().WHATSAPP_ACCESS_TOKEN && !!env().WHATSAPP_PHONE_NUMBER_ID,
  async send(m) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${env().WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env().WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: m.to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: "schoolsphere_update",
          language: { code: "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: m.title }, { type: "text", text: m.body.slice(0, 900) }] }],
        },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp API responded ${res.status}`);
    const json = (await res.json()) as { messages?: { id: string }[] };
    return { id: json.messages?.[0]?.id };
  },
};

/** Web Push needs VAPID keys and stored browser subscriptions; not configured in this release. */
const webPush: ChannelProvider = {
  channel: "push",
  name: "Web Push",
  configured: () => false,
  async send() {
    throw new Error("Web Push is not configured");
  },
};

export const CHANNEL_PROVIDERS: Record<ChannelName, ChannelProvider> = { email: resendEmail, whatsapp: metaWhatsApp, push: webPush };

export function channelStatus() {
  return (Object.values(CHANNEL_PROVIDERS) as ChannelProvider[]).map((p) => ({
    channel: p.channel,
    provider: p.name,
    configured: p.configured(),
    sendingEnabled: p.configured() && env().NOTIFICATIONS_EXTERNAL_ENABLED,
  }));
}

export async function deliverExternally(
  input: { type: string; title: string; body: string; link?: string },
  inserted: { id: string; user_id: string }[],
): Promise<void> {
  if (inserted.length === 0) return;
  const prefs = await withService((sql) =>
    sql.many<{ user_id: string; email: boolean; push: boolean; whatsapp: boolean; address: string; phone: string | null }>(
      `select p.user_id, p.email, p.push, p.whatsapp, up.email as address, up.phone
       from notification_preferences p join user_profiles up on up.id = p.user_id
       where p.type = $2 and p.user_id = any($1::uuid[]) and (p.email or p.push or p.whatsapp)`,
      [pgArray(inserted.map((i) => i.user_id)), input.type],
    ),
  );
  if (prefs.length === 0) return;
  const notificationFor = new Map(inserted.map((i) => [i.user_id, i.id]));
  const records: { notificationId: string; channel: ChannelName; status: string; providerId?: string; error?: string }[] = [];

  for (const p of prefs) {
    for (const channel of ["email", "push", "whatsapp"] as const) {
      if (!p[channel]) continue;
      const provider = CHANNEL_PROVIDERS[channel];
      const notificationId = notificationFor.get(p.user_id)!;
      const to = channel === "email" ? p.address : p.phone;
      if (!provider.configured()) {
        records.push({ notificationId, channel, status: "skipped_not_configured" });
      } else if (!env().NOTIFICATIONS_EXTERNAL_ENABLED || !to) {
        records.push({ notificationId, channel, status: "skipped_by_policy" });
      } else {
        try {
          const r = await provider.send({ to, title: input.title, body: input.body, link: input.link });
          records.push({ notificationId, channel, status: "sent", providerId: r.id });
        } catch (error) {
          logger.warn("External notification failed", { channel, error });
          records.push({ notificationId, channel, status: "failed", error: (error as Error).message.slice(0, 300) });
        }
      }
    }
  }
  if (records.length) {
    await withService(async (sql) => {
      for (const r of records) {
        await sql.exec(
          "insert into notification_deliveries (notification_id, channel, status, provider_message_id, error) values ($1, $2, $3, $4, $5)",
          [r.notificationId, r.channel, r.status, r.providerId ?? null, r.error ?? null],
        );
      }
    });
  }
}
