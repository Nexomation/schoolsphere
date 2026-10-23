/** Date helpers that work on school-local calendar dates ("YYYY-MM-DD"). */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/** Today's calendar date in the school's timezone. */
export function todayIn(timezone = DEFAULT_TIMEZONE, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function parseDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date: ${date}`);
  return new Date(`${date}T00:00:00Z`);
}

export function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateKey(d);
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: string): number {
  const day = parseDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthRange(month: string): { from: string; to: string } {
  // month: "YYYY-MM"
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function minDate(a: string, b: string) {
  return a < b ? a : b;
}

const displayDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const displayDateTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: DEFAULT_TIMEZONE,
});
const displayTime = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: DEFAULT_TIMEZONE });

/** "22 Oct 2026" for a calendar date. */
export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return displayDate.format(parseDate(date.slice(0, 10)));
}

/** "22 Oct, 3:45 pm" for an instant, in IST. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return displayDateTime.format(new Date(iso));
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return displayTime.format(new Date(iso));
}

/** "HH:MM:SS" -> "7:05 am" */
export function formatClockTime(time: string | null | undefined): string {
  if (!time) return "—";
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function relativeTime(iso: string, now = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

/** Current time in ms. Server components call this once per request instead of Date.now() in render. */
export function nowMs(): number {
  return Date.now();
}
