import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UrlDateInput } from "@/components/url-date-input";
import { requirePageContext } from "@/lib/auth/context";
import { transportReport } from "@/lib/data/transport";
import { schoolToday } from "@/lib/data/school";
import { addDays } from "@/lib/domain/dates";

export const metadata: Metadata = { title: "Transport reports" };

const valid = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function TransportReportsPage({ searchParams }: PageProps<"/app/transport/reports">) {
  const ctx = await requirePageContext("transport.manage");
  const sp = await searchParams;
  const today = await ctx.db((sql) => schoolToday(sql, ctx.schoolId));
  const from = valid(sp.from) ? (sp.from as string) : addDays(today, -30);
  const to = valid(sp.to) ? (sp.to as string) : today;
  const rows = await ctx.db((sql) => transportReport(sql, ctx.schoolId, from, to));
  return (
    <>
      <PageHeader title="Transport reports" description="Trips, delays, route deviations and boardings per route. Simulated trips are counted separately." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <UrlDateInput param="from" value={from} label="From" max={today} />
        <UrlDateInput param="to" value={to} label="To" max={today} />
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Route</TableHead>
                <TableHead className="text-right">Trips</TableHead>
                <TableHead className="text-right">of which simulated</TableHead>
                <TableHead className="text-right">Avg duration</TableHead>
                <TableHead className="text-right">Delay alerts</TableHead>
                <TableHead className="text-right">Deviations</TableHead>
                <TableHead className="text-right">Boardings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.route}>
                  <TableCell className="font-medium">{r.route}</TableCell>
                  <TableCell className="text-right tabular">{r.trips}</TableCell>
                  <TableCell className="text-right tabular">{r.simulated}</TableCell>
                  <TableCell className="text-right tabular">{r.avg_minutes === null ? "—" : `${r.avg_minutes} min`}</TableCell>
                  <TableCell className="text-right tabular">{r.delays}</TableCell>
                  <TableCell className="text-right tabular">{r.deviations}</TableCell>
                  <TableCell className="text-right tabular">{r.boardings}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
