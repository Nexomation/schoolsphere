"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { useActionRunner } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { markAllReadAction, markReadAction, savePreferencesAction } from "./actions";

export function MarkAllRead({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  return (
    <Button size="sm" variant="outline" disabled={disabled || pending} onClick={() => run(markAllReadAction, { onSuccess: () => router.refresh() })}>
      <CheckCheck aria-hidden /> Mark all as read
    </Button>
  );
}

/** Opening a notification marks it read, then follows its link. */
export function NotificationLink({ id, href, unread, children }: { id: string; href: string | null; unread: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const open = async () => {
    if (unread) await markReadAction(id);
    if (href) router.push(href);
    else router.refresh();
  };
  return href ? (
    <Link href={href} onClick={(e) => { e.preventDefault(); open(); }} className="block rounded-lg p-3 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      {children}
    </Link>
  ) : (
    <button type="button" onClick={open} className="block w-full rounded-lg p-3 text-left hover:bg-muted/60">
      {children}
    </button>
  );
}

type Pref = { type: string; label: string; inApp: boolean; email: boolean; push: boolean; whatsapp: boolean };

export function PreferencesForm({ initial, channels }: { initial: Pref[]; channels: { channel: "email" | "push" | "whatsapp"; provider: string; configured: boolean; sendingEnabled: boolean }[] }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const { run, pending } = useActionRunner();
  const set = (i: number, key: "inApp" | "email" | "push" | "whatsapp", value: boolean) => setPrefs((p) => p.map((x, j) => (j === i ? { ...x, [key]: value } : x)));
  const cols: { key: "inApp" | "email" | "push" | "whatsapp"; label: string; note?: string }[] = [
    { key: "inApp", label: "In app" },
    ...channels.map((c) => ({ key: c.channel as "email" | "push" | "whatsapp", label: c.channel === "whatsapp" ? "WhatsApp" : c.channel === "email" ? "Email" : "Push", note: c.sendingEnabled ? undefined : "not active" })),
  ];
  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 font-medium">Type</th>
              {cols.map((c) => (
                <th key={c.key} className="px-2 py-2 text-center font-medium">
                  {c.label}
                  {c.note && <span className="block text-[10px] font-normal">({c.note})</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prefs.map((p, i) => (
              <tr key={p.type} className="border-t">
                <td className="py-2">{p.label}</td>
                {cols.map((c) => (
                  <td key={c.key} className="px-2 py-2 text-center">
                    <Switch checked={p[c.key]} onCheckedChange={(v) => set(i, c.key, v)} aria-label={`${p.label}: ${c.label}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button className="w-fit" disabled={pending} onClick={() => run(() => savePreferencesAction(prefs), { onSuccess: () => router.refresh() })}>
        Save preferences
      </Button>
    </div>
  );
}
