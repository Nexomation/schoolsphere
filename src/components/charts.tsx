"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Chart palette (validated for colour-vision deficiency with the dataviz
 * validator): series 1 indigo, series 2 teal, in that fixed order.
 * Single-series charts need no legend; the card title names the series.
 */
const SERIES = ["#4f46e5", "#0d9488"] as const;
const AXIS = { fontSize: 12, fill: "var(--muted-foreground)" };
const GRID = "var(--border)";

type Point = { label: string; value: number | null };

function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-muted-foreground">
          {payload.length > 1 && <span className="inline-block size-2 rounded-full" style={{ background: p.color }} aria-hidden />}
          {payload.length > 1 && <span>{p.name}</span>}
          <span className="tabular font-medium text-foreground">{typeof p.value === "number" ? format(p.value) : "—"}</span>
        </p>
      ))}
    </div>
  );
}

function DataTableFallback({ rows, columns }: { rows: (string | number | null)[][]; columns: string[] }) {
  return (
    <details className="no-print mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none hover:text-foreground">View as table</summary>
      <table className="mt-2 w-full">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} className="py-1 text-left font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((v, j) => (
                <td key={j} className="tabular py-1">
                  {v ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function TrendLineChart({
  data,
  unit = "",
  domain,
  height = 220,
  name,
}: {
  data: Point[];
  unit?: string;
  domain?: [number, number];
  height?: number;
  name: string;
}) {
  const format = (v: number) => `${v}${unit}`;
  return (
    <div>
      <div style={{ height }} role="img" aria-label={`${name} line chart`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={domain ?? ["auto", "auto"]} tickFormatter={format} width={48} />
            <Tooltip content={<ChartTooltip format={format} />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
            <Line
              type="monotone"
              dataKey="value"
              name={name}
              stroke={SERIES[0]}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTableFallback columns={["", name]} rows={data.map((d) => [d.label, d.value === null ? null : format(d.value)])} />
    </div>
  );
}

export function SimpleBarChart({
  data,
  name,
  height = 220,
  valueFormat = "number",
  domain,
}: {
  data: Point[];
  name: string;
  height?: number;
  valueFormat?: "number" | "inr" | "percent";
  domain?: [number, number];
}) {
  const format = (v: number) =>
    valueFormat === "inr"
      ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 }).format(v)
      : valueFormat === "percent"
        ? `${v}%`
        : new Intl.NumberFormat("en-IN").format(v);
  return (
    <div>
      <div style={{ height }} role="img" aria-label={`${name} bar chart`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -4 }} barCategoryGap="30%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={0} minTickGap={4} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={format} width={60} domain={domain} />
            <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
            <Bar dataKey="value" name={name} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTableFallback columns={["", name]} rows={data.map((d) => [d.label, d.value === null ? null : format(d.value)])} />
    </div>
  );
}

/** Two series side by side (e.g. a student's score vs the class average). */
export function ComparisonBarChart({
  data,
  seriesNames,
  unit = "",
  height = 240,
  domain,
}: {
  data: { label: string; a: number | null; b: number | null }[];
  seriesNames: [string, string];
  unit?: string;
  height?: number;
  domain?: [number, number];
}) {
  const format = (v: number) => `${v}${unit}`;
  return (
    <div>
      <div style={{ height }} role="img" aria-label={`${seriesNames[0]} compared with ${seriesNames[1]}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} barGap={2} barCategoryGap="25%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={0} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={format} width={48} domain={domain} />
            <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
            <Bar dataKey="a" name={seriesNames[0]} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="b" name={seriesNames[1]} fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTableFallback
        columns={["", ...seriesNames]}
        rows={data.map((d) => [d.label, d.a === null ? null : format(d.a), d.b === null ? null : format(d.b)])}
      />
    </div>
  );
}
