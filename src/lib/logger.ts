/**
 * Structured JSON logging to stdout/stderr. Hosting platforms (Vercel,
 * Render, Docker) collect these lines; values are never sent elsewhere.
 * Do not log secrets, passwords, tokens or children's personal details.
 */
type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, message: string, data?: Record<string, unknown>) {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(data ? serialize(data) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") console.error(line);
  else if (level !== "debug" || process.env.NODE_ENV !== "production") console.log(line);
}

function serialize(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = v instanceof Error ? { name: v.name, message: v.message, stack: v.stack?.split("\n").slice(0, 6).join("\n") } : v;
  }
  return out;
}

export const logger = {
  debug: (m: string, d?: Record<string, unknown>) => write("debug", m, d),
  info: (m: string, d?: Record<string, unknown>) => write("info", m, d),
  warn: (m: string, d?: Record<string, unknown>) => write("warn", m, d),
  error: (m: string, d?: Record<string, unknown>) => write("error", m, d),
};
