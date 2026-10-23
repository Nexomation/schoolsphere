"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function UrlDateInput({ param, value, label, max, type = "date" }: { param: string; value: string; label: string; max?: string; type?: "date" | "month" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-1">
      <Label htmlFor={`url-${param}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={`url-${param}`}
        type={type}
        value={value}
        max={max}
        disabled={pending}
        className="h-9 w-full sm:w-44"
        onChange={(e) => {
          if (!e.target.value) return;
          const next = new URLSearchParams(params.toString());
          next.set(param, e.target.value);
          start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
        }}
      />
    </div>
  );
}
