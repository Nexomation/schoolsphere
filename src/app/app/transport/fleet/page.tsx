import type { Metadata } from "next";
import { ConfirmAction } from "@/components/confirm-action";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, humanize } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePageContext } from "@/lib/auth/context";
import { listStaff } from "@/lib/data/academics";
import { listDrivers, listVehicles } from "@/lib/data/transport";
import { schoolToday } from "@/lib/data/school";
import { addDays, formatDate, formatDateTime } from "@/lib/domain/dates";
import { revokeDeviceAction } from "../actions";
import { DeviceTokenDialog, DriverDialog, VehicleDialog } from "../forms";

export const metadata: Metadata = { title: "Vehicles & drivers" };

function Expiry({ date, today }: { date: string | null; today: string }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const tone = date < today ? "danger" : date <= addDays(today, 30) ? "warning" : undefined;
  return tone ? <StatusBadge status="due" tone={tone} label={formatDate(date)} /> : <span className="text-sm">{formatDate(date)}</span>;
}

export default async function FleetPage() {
  const ctx = await requirePageContext("transport.manage");
  const d = await ctx.db(async (sql) => ({
    today: await schoolToday(sql, ctx.schoolId),
    vehicles: await listVehicles(sql, ctx.schoolId),
    drivers: await listDrivers(sql, ctx.schoolId),
    staff: (await listStaff(sql, ctx.schoolId)).filter((s) => s.status === "active" && s.staff_type === "transport"),
    devices: await sql.many<{ id: string; name: string; vehicle: string; last_seen_at: string | null; revoked_at: string | null }>(
      `select d.id, d.name, v.registration_no as vehicle, d.last_seen_at, d.revoked_at from tracking_devices d join vehicles v on v.id = d.vehicle_id
       where d.school_id = $1 order by d.created_at desc`,
      [ctx.schoolId],
    ),
  }));
  return (
    <>
      <PageHeader title="Vehicles & drivers" description="Document expiry dates within 30 days are highlighted." actions={<VehicleDialog />} />
      <Card className="mb-6">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Insurance</TableHead>
                <TableHead>Fitness</TableHead>
                <TableHead>Permit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.vehicles.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <span className="font-medium">{v.registration_no}</span>
                    <span className="block text-xs text-muted-foreground">
                      {humanize(v.vehicle_type)} · {v.capacity} seats{v.make_model ? ` · ${v.make_model}` : ""}
                    </span>
                  </TableCell>
                  <TableCell>{v.route ?? "—"}</TableCell>
                  <TableCell><Expiry date={v.insurance_expiry} today={d.today} /></TableCell>
                  <TableCell><Expiry date={v.fitness_expiry} today={d.today} /></TableCell>
                  <TableCell><Expiry date={v.permit_expiry} today={d.today} /></TableCell>
                  <TableCell><StatusBadge status={v.status} /></TableCell>
                  <TableCell className="text-right"><VehicleDialog vehicle={v} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Drivers</CardTitle>
              <CardDescription>Drivers sign in to the driver screen to run trips and share location.</CardDescription>
            </div>
            <DriverDialog staff={d.staff.map((s) => ({ value: s.id, label: s.full_name }))} />
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {d.drivers.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{x.name}</span> {x.route && <span className="text-muted-foreground">· {x.route}</span>}
                    <span className="block text-xs text-muted-foreground">
                      Licence {x.license_no} · valid until {formatDate(x.license_expiry)} · {x.has_login ? "has app login" : "no app login yet"}
                    </span>
                  </span>
                  <Expiry date={x.license_expiry} today={d.today} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>GPS trackers</CardTitle>
              <CardDescription>Optional hardware trackers. Without one, the driver&apos;s phone shares location during trips.</CardDescription>
            </div>
            <DeviceTokenDialog vehicles={d.vehicles.map((v) => ({ value: v.id, label: v.registration_no }))} />
          </CardHeader>
          <CardContent>
            {d.devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trackers registered.</p>
            ) : (
              <ul className="divide-y text-sm">
                {d.devices.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{x.name}</span> · {x.vehicle}
                      <span className="block text-xs text-muted-foreground">{x.last_seen_at ? `Last seen ${formatDateTime(x.last_seen_at)}` : "Never connected"}</span>
                    </span>
                    {x.revoked_at ? (
                      <StatusBadge status="inactive" label="Revoked" />
                    ) : (
                      <ConfirmAction action={revokeDeviceAction.bind(null, x.id)} title="Revoke this tracker?" description="Its token stops working immediately." confirmLabel="Revoke" variant="destructive" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
