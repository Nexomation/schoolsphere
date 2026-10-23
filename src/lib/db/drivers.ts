import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { NotFoundError } from "../errors";
import type { Database, Row, Sql } from "./types";

// PostgreSQL type OIDs we normalise across drivers.
const OID = {
  int8: 20,
  numeric: 1700,
  date: 1082,
  timestamp: 1114,
  timestamptz: 1184,
  time: 1083,
} as const;

const toNumber = (v: string) => Number(v);
// PostgreSQL text format: "2026-10-22 05:30:00.123456+05:30" or "...+00". Normalise to ISO-8601 UTC.
const toIso = (v: string) => {
  if (v === "infinity" || v === "-infinity") return v;
  const normalised = v.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(normalised);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
};
const identity = (v: string) => v;

function wrap(query: (text: string, params: readonly unknown[]) => Promise<Row[]>): Sql {
  return {
    many: async <T>(text: string, params: readonly unknown[] = []) => (await query(text, params)) as T[],
    one: async <T>(text: string, params: readonly unknown[] = []) => {
      const rows = await query(text, params);
      if (rows.length !== 1) throw new NotFoundError();
      return rows[0] as T;
    },
    maybeOne: async <T>(text: string, params: readonly unknown[] = []) => {
      const rows = await query(text, params);
      return (rows[0] as T | undefined) ?? null;
    },
    exec: async (text: string, params: readonly unknown[] = []) => {
      await query(text, params);
    },
  };
}

/** In-process PostgreSQL (WASM) for local development and tests. */
export async function createPgliteDatabase(
  dataDir?: string,
  loadDataDir?: Blob,
): Promise<Database & { pglite: PGlite }> {
  const pg = new PGlite({
    dataDir,
    loadDataDir,
    parsers: {
      [OID.int8]: toNumber,
      [OID.numeric]: toNumber,
      [OID.date]: identity,
      [OID.time]: identity,
      [OID.timestamptz]: toIso,
      [OID.timestamp]: toIso,
    },
  });
  await pg.waitReady;
  return {
    driver: "pglite",
    pglite: pg,
    async transaction(fn) {
      return pg.transaction(async (tx) =>
        fn(wrap(async (text, params) => (await tx.query<Row>(text, params as unknown[])).rows)),
      );
    },
    async execScript(script) {
      await pg.exec(script);
    },
    async close() {
      await pg.close();
    },
  };
}

/** Network PostgreSQL (Supabase or any Postgres 15+). */
export async function createPostgresDatabase(url: string): Promise<Database> {
  const sql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    onnotice: () => {},
    types: {
      int8: { to: OID.int8, from: [OID.int8], serialize: (x: number) => String(x), parse: toNumber },
      numeric: { to: OID.numeric, from: [OID.numeric], serialize: (x: number) => String(x), parse: toNumber },
      date: { to: OID.date, from: [OID.date], serialize: (x: string) => x, parse: identity },
      time: { to: OID.time, from: [OID.time], serialize: (x: string) => x, parse: identity },
      timestamptz: {
        to: OID.timestamptz,
        from: [OID.timestamptz, OID.timestamp],
        serialize: (x: string) => x,
        parse: toIso,
      },
    },
  });
  return {
    driver: "postgres",
    async transaction(fn) {
      const result = await sql.begin(async (tx) =>
        fn(wrap(async (text, params) => (await tx.unsafe(text, params as never[])) as unknown as Row[])),
      );
      return result as Awaited<ReturnType<typeof fn>>;
    },
    async execScript(script) {
      await sql.unsafe(script);
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
