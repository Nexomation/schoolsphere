import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="white" strokeWidth="2.2" />
      <path d="M7.5 16h17M16 7.5c3 2.6 3 14.4 0 17M16 7.5c-3 2.6-3 14.4 0 17" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span>{name}</span>
    </span>
  );
}
