"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all";

function useUrlParam(param: string, resetParam?: string) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    if (resetParam) next.delete(resetParam);
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { value: params.get(param) ?? "", set, pending };
}

export function UrlSearchInput({ param, placeholder, resetParam }: { param: string; placeholder: string; resetParam?: string }) {
  const { value, set, pending } = useUrlParam(param, resetParam);
  const [text, setText] = useState(value);
  useEffect(() => {
    if (text === value) return;
    const id = setTimeout(() => set(text.trim() || null), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 pl-8"
      />
      {pending && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
    </div>
  );
}

export function UrlSelect({
  param,
  label,
  options,
  resetParam,
  allLabel,
}: {
  param: string;
  label: string;
  options: { value: string; label: string }[];
  resetParam?: string;
  allLabel?: string;
}) {
  const { value, set } = useUrlParam(param, resetParam);
  return (
    <Select value={value || ALL} onValueChange={(v) => set(v === ALL ? null : v)}>
      <SelectTrigger className="h-9 w-full sm:w-48" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel ?? `All ${label.toLowerCase()}`}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A select that navigates when changed and has no "all" option (e.g. choosing a child or a section). */
export function UrlPicker({
  param,
  label,
  options,
  value,
  className,
}: {
  param: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  className?: string;
}) {
  const { set } = useUrlParam(param);
  return (
    <Select value={value} onValueChange={(v) => set(v)}>
      <SelectTrigger className={className ?? "h-9 w-full sm:w-56"} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
