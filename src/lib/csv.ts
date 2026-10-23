import Papa from "papaparse";

/**
 * CSV helpers. Exports neutralise spreadsheet formula injection: any cell that
 * starts with = + - @ (or a tab/CR) is prefixed with an apostrophe so Excel
 * and Google Sheets treat it as text.
 */
export function toCsv(rows: Record<string, unknown>[], columns: { key: string; header: string }[]): string {
  const data = rows.map((r) => columns.map((c) => sanitizeCell(r[c.key])));
  // BOM so Excel opens UTF-8 (₹, Tamil names) correctly.
  return "﻿" + Papa.unparse({ fields: columns.map((c) => c.header), data });
}

export function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[]; errors: string[] } {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"),
    transform: (v) => v.trim(),
  });
  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    errors: result.errors.slice(0, 20).map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`),
  };
}

export function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
