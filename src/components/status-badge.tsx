import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  success: "bg-success/10 text-success ring-success/25",
  warning: "bg-warning/10 text-warning ring-warning/25",
  danger: "bg-destructive/10 text-destructive ring-destructive/25",
  info: "bg-info/10 text-info ring-info/25",
  accent: "bg-accent text-accent-foreground ring-primary/20",
};

const STATUS_TONES: Record<string, Tone> = {
  present: "success",
  late: "warning",
  absent: "danger",
  excused: "info",
  active: "success",
  published: "success",
  verified: "success",
  graded: "success",
  paid: "success",
  captured: "success",
  completed: "neutral",
  submitted: "info",
  pending: "warning",
  partial: "warning",
  overdue: "danger",
  due: "warning",
  rejected: "danger",
  voided: "danger",
  cancelled: "neutral",
  draft: "neutral",
  scheduled: "info",
  marks_entry: "warning",
  in_progress: "info",
  live: "success",
  delayed: "warning",
  offline: "danger",
  no_data: "neutral",
  onboarding: "warning",
  suspended: "danger",
  inactive: "neutral",
  maintenance: "warning",
  not_submitted: "neutral",
  sandbox: "warning",
  pass: "success",
  fail: "danger",
  incomplete: "warning",
  invited: "info",
};

const ACRONYMS = new Set(["upi", "ptm", "cbse", "icse", "neft", "imps", "rtgs", "gps", "eta", "pos", "dd"]);

export function humanize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w+\b/g, (word) => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word))
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function StatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status: string;
  label?: string;
  tone?: Tone;
  className?: string;
}) {
  const t = tone ?? STATUS_TONES[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        tones[t],
        className,
      )}
    >
      {label ?? humanize(status)}
    </span>
  );
}
