import { z } from "zod";

/**
 * Server-side configuration. Read once and validated, so a misconfigured
 * deployment fails loudly at startup instead of half-working.
 *
 * Never import this from a Client Component: it contains secrets.
 */
const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),

    DB_DRIVER: z.enum(["pglite", "postgres"]).default("pglite"),
    PGLITE_DATA_DIR: z.string().default(".data/pglite"),
    DATABASE_URL: z.string().optional(),

    AUTH_PROVIDER: z.enum(["local", "supabase"]).default("local"),
    AUTH_SECRET: z.string().optional(),
    ALLOW_LOCAL_AUTH_IN_PRODUCTION: bool,
    NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

    DEMO_MODE: bool,

    STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
    LOCAL_UPLOAD_DIR: z.string().default(".data/uploads"),
    SUPABASE_STORAGE_BUCKET: z.string().default("school-files"),

    PAYMENTS_PROVIDER: z.enum(["none", "razorpay"]).default("none"),
    PAYMENTS_SANDBOX_ENABLED: bool,
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

    AI_PROVIDER: z.enum(["none", "anthropic", "openai"]).default("none"),
    AI_MODEL: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),

    NOTIFICATIONS_EXTERNAL_ENABLED: bool,
    EMAIL_PROVIDER: z.enum(["none", "resend"]).default("none"),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    WHATSAPP_PROVIDER: z.enum(["none", "meta"]).default("none"),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    PUSH_PROVIDER: z.enum(["none", "webpush"]).default("none"),

    TRANSPORT_SIMULATOR_ENABLED: bool,
    MAP_TILE_URL: z.string().default("https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
    MAP_ATTRIBUTION: z
      .string()
      .default('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'),
  })
  .superRefine((env, ctx) => {
    if (env.DB_DRIVER === "postgres" && !env.DATABASE_URL) {
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "required when DB_DRIVER=postgres" });
    }
    if (env.AUTH_PROVIDER === "local") {
      if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
        ctx.addIssue({ code: "custom", path: ["AUTH_SECRET"], message: "must be at least 32 characters for local auth" });
      }
    }
    if (env.AUTH_PROVIDER === "supabase") {
      for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "required when AUTH_PROVIDER=supabase" });
      }
    }
    if (env.PAYMENTS_PROVIDER === "razorpay") {
      for (const key of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "required when PAYMENTS_PROVIDER=razorpay" });
      }
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid SchoolSphere configuration:\n${details}\nSee .env.example and README.md.`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Test helper: forget the cached configuration after changing process.env. */
export function resetEnvCache() {
  cached = undefined;
}

/** True when the app may use development-only conveniences (demo sign-in, simulator, sandbox). */
export function isDemoEnvironment(): boolean {
  return env().DEMO_MODE;
}
