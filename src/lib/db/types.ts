export type Row = Record<string, unknown>;

/**
 * Minimal, driver-neutral query interface. All SQL in SchoolSphere uses
 * positional parameters ($1, $2, ...) and is written by hand in the
 * repository modules under src/lib/data.
 *
 * Type conventions returned by every driver:
 *   bigint / numeric -> number       (money is integer paise)
 *   date             -> "YYYY-MM-DD" string (no timezone shifting)
 *   timestamptz      -> ISO-8601 string
 *   time             -> "HH:MM:SS" string
 */
export interface Sql {
  many<T = Row>(text: string, params?: readonly unknown[]): Promise<T[]>;
  /** Exactly one row, otherwise throws NotFoundError. */
  one<T = Row>(text: string, params?: readonly unknown[]): Promise<T>;
  maybeOne<T = Row>(text: string, params?: readonly unknown[]): Promise<T | null>;
  exec(text: string, params?: readonly unknown[]): Promise<void>;
}

export interface Database {
  readonly driver: "pglite" | "postgres";
  /** Runs `fn` in one transaction as the database owner (no RLS). Use through withUser/withService. */
  transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  /** Executes a multi-statement SQL script (migrations). */
  execScript(script: string): Promise<void>;
  close(): Promise<void>;
}

/** Encodes values as a PostgreSQL array literal for `$1::uuid[]` / `$1::text[]` parameters. */
export function pgArray(values: readonly (string | number)[]): string {
  return `{${values
    .map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`;
}
