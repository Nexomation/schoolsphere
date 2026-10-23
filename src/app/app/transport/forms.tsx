"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CheckboxField, FormGrid, SelectField, SubmitButton, TextField } from "@/components/form/fields";
import { useActionForm, useActionRunner } from "@/components/form/use-action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatClockTime } from "@/lib/domain/dates";
import { driverInput, routeInput, stopInput, studentRouteInput, vehicleInput } from "@/lib/schemas/transport";
import { assignStudentAction, createDeviceTokenAction, deleteStopAction, moveStopAction, saveDriverAction, saveRouteAction, saveStopAction, saveVehicleAction } from "./actions";

const LeafletMap = dynamic(() => import("@/components/transport/leaflet-map"), { ssr: false, loading: () => <Skeleton className="h-[360px] w-full rounded-xl" /> });

type Option = { value: string; label: string };

function useClose() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return { open, setOpen, done: () => { setOpen(false); router.refresh(); } };
}

export function RouteDialog({ route, vehicles, drivers, staff }: { route?: { id: string; name: string; code: string; vehicle_id: string | null; driver_id: string | null; attendant_staff_id: string | null }; vehicles: Option[]; drivers: Option[]; staff: Option[] }) {
  const { open, setOpen, done } = useClose();
  const { form, onSubmit, pending } = useActionForm({
    schema: routeInput,
    defaultValues: { id: route?.id ?? "", name: route?.name ?? "", code: route?.code ?? "", vehicleId: route?.vehicle_id ?? "", driverId: route?.driver_id ?? "", attendantStaffId: route?.attendant_staff_id ?? "" },
    action: saveRouteAction,
    resetOnSuccess: !route,
    onSuccess: done,
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {route ? (
          <Button size="sm" variant="outline">
            <Pencil aria-hidden /> Edit route
          </Button>
        ) : (
          <Button size="sm">
            <Plus aria-hidden /> New route
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{route ? "Edit route" : "New route"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormGrid>
            <TextField control={form.control} name="name" label="Name" required />
            <TextField control={form.control} name="code" label="Code" required placeholder="R3" />
            <SelectField control={form.control} name="vehicleId" label="Vehicle" options={vehicles} allowNone noneLabel="Not assigned" />
            <SelectField control={form.control} name="driverId" label="Driver" options={drivers} allowNone noneLabel="Not assigned" />
            <SelectField control={form.control} name="attendantStaffId" label="Attendant" options={staff} allowNone noneLabel="None" />
          </FormGrid>
          <SubmitButton pending={pending} size="default">
            Save route
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Stop = { id: string; stop_order: number; name: string; latitude: number; longitude: number; pickup_time: string | null; drop_time: string | null; students: number };

export function StopEditor({ routeId, stops, tileUrl, attribution }: { routeId: string; stops: Stop[]; tileUrl: string; attribution: string }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [editing, setEditing] = useState<Stop | null>(null);
  const { form, onSubmit, pending: saving } = useActionForm({
    schema: stopInput,
    defaultValues: { routeId, id: "", name: "", latitude: "" as unknown as number, longitude: "" as unknown as number, pickupTime: "", dropTime: "" },
    action: saveStopAction,
    onSuccess: () => {
      setEditing(null);
      form.reset({ routeId, id: "", name: "", latitude: "" as unknown as number, longitude: "" as unknown as number, pickupTime: "", dropTime: "" });
      router.refresh();
    },
  });
  const onMapClick = useCallback(
    (lat: number, lng: number) => {
      form.setValue("latitude", lat, { shouldValidate: true });
      form.setValue("longitude", lng, { shouldValidate: true });
    },
    [form],
  );
  const edit = (s: Stop) => {
    setEditing(s);
    form.reset({ routeId, id: s.id, name: s.name, latitude: s.latitude, longitude: s.longitude, pickupTime: s.pickup_time?.slice(0, 5) ?? "", dropTime: s.drop_time?.slice(0, 5) ?? "" });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid content-start gap-3">
        <LeafletMap tileUrl={tileUrl} attribution={attribution} stops={stops.map((s) => ({ id: s.id, name: s.name, lat: s.latitude, lng: s.longitude, order: s.stop_order, highlight: s.id === editing?.id }))} onMapClick={onMapClick} height={360} />
        <p className="text-xs text-muted-foreground">Click the map to fill in the coordinates for a new or edited stop. The last stop of a morning route is normally the school.</p>
      </div>
      <div className="grid content-start gap-4">
        <ol className="divide-y rounded-xl border">
          {stops.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{s.stop_order}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground">
                  Pickup {formatClockTime(s.pickup_time)} · Drop {formatClockTime(s.drop_time)} · {s.students} students
                </span>
              </span>
              <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={pending || i === 0} onClick={() => run(() => moveStopAction(s.id, -1), { onSuccess: () => router.refresh() })}>
                <ArrowUp />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={pending || i === stops.length - 1} onClick={() => run(() => moveStopAction(s.id, 1), { onSuccess: () => router.refresh() })}>
                <ArrowDown />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => edit(s)}>
                <Pencil />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={`Delete ${s.name}`} disabled={pending || s.students > 0} onClick={() => run(() => deleteStopAction(s.id), { onSuccess: () => router.refresh() })}>
                <Trash2 />
              </Button>
            </li>
          ))}
          {stops.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">No stops yet.</li>}
        </ol>
        <form onSubmit={onSubmit} noValidate className="grid gap-3 rounded-xl border p-3">
          <p className="text-sm font-medium">{editing ? `Edit stop ${editing.stop_order}` : "Add a stop at the end"}</p>
          <TextField control={form.control} name="name" label="Stop name" required />
          <FormGrid>
            <TextField control={form.control} name="latitude" label="Latitude" inputMode="decimal" required />
            <TextField control={form.control} name="longitude" label="Longitude" inputMode="decimal" required />
            <TextField control={form.control} name="pickupTime" label="Morning pickup" type="time" />
            <TextField control={form.control} name="dropTime" label="Afternoon drop" type="time" />
          </FormGrid>
          <div className="flex gap-2">
            <SubmitButton pending={saving} size="default">
              {editing ? "Save stop" : "Add stop"}
            </SubmitButton>
            {editing && (
              <Button type="button" variant="ghost" onClick={() => { setEditing(null); form.reset(); }}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export function AssignStudentForm({ routeId, students, stops }: { routeId: string; students: Option[]; stops: Option[] }) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: studentRouteInput,
    defaultValues: { studentId: "", routeId, stopId: "", usesPickup: true, usesDrop: true },
    action: assignStudentAction,
    resetOnSuccess: true,
    onSuccess: () => router.refresh(),
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3">
      <FormGrid>
        <SelectField control={form.control} name="studentId" label="Student" options={students} required description="Moving a student from another route ends their old assignment." />
        <SelectField control={form.control} name="stopId" label="Stop" options={stops} required />
      </FormGrid>
      <div className="flex flex-wrap gap-4">
        <CheckboxField control={form.control} name="usesPickup" label="Morning pickup" />
        <CheckboxField control={form.control} name="usesDrop" label="Afternoon drop" />
      </div>
      <SubmitButton pending={pending} size="default">
        Assign to route
      </SubmitButton>
    </form>
  );
}

export function VehicleDialog({ vehicle }: { vehicle?: { id: string; registration_no: string; vehicle_type: string; capacity: number; make_model: string | null; insurance_expiry: string | null; fitness_expiry: string | null; permit_expiry: string | null; status: string } }) {
  const { open, setOpen, done } = useClose();
  const { form, onSubmit, pending } = useActionForm({
    schema: vehicleInput,
    defaultValues: {
      id: vehicle?.id ?? "",
      registrationNo: vehicle?.registration_no ?? "",
      vehicleType: (vehicle?.vehicle_type ?? "van") as "van",
      capacity: vehicle?.capacity ?? 20,
      makeModel: vehicle?.make_model ?? "",
      insuranceExpiry: vehicle?.insurance_expiry ?? "",
      fitnessExpiry: vehicle?.fitness_expiry ?? "",
      permitExpiry: vehicle?.permit_expiry ?? "",
      status: (vehicle?.status ?? "active") as "active",
    },
    action: saveVehicleAction,
    resetOnSuccess: !vehicle,
    onSuccess: done,
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {vehicle ? (
          <Button size="icon-sm" variant="ghost" aria-label={`Edit ${vehicle.registration_no}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus aria-hidden /> Add vehicle
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vehicle ? vehicle.registration_no : "Add vehicle"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormGrid>
            <TextField control={form.control} name="registrationNo" label="Registration no" required />
            <SelectField control={form.control} name="vehicleType" label="Type" options={[{ value: "bus", label: "Bus" }, { value: "mini_bus", label: "Mini bus" }, { value: "van", label: "Van" }]} />
            <TextField control={form.control} name="capacity" label="Seats" type="number" required />
            <TextField control={form.control} name="makeModel" label="Make & model" />
            <TextField control={form.control} name="insuranceExpiry" label="Insurance valid until" type="date" />
            <TextField control={form.control} name="fitnessExpiry" label="Fitness certificate until" type="date" />
            <TextField control={form.control} name="permitExpiry" label="Permit valid until" type="date" />
            <SelectField control={form.control} name="status" label="Status" options={[{ value: "active", label: "Active" }, { value: "maintenance", label: "In maintenance" }, { value: "inactive", label: "Inactive" }]} />
          </FormGrid>
          <SubmitButton pending={pending} size="default">
            Save vehicle
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DriverDialog({ staff }: { staff: Option[] }) {
  const { open, setOpen, done } = useClose();
  const { form, onSubmit, pending } = useActionForm({
    schema: driverInput,
    defaultValues: { staffId: "", licenseNo: "", licenseExpiry: "" },
    action: saveDriverAction,
    resetOnSuccess: true,
    onSuccess: done,
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus aria-hidden /> Add driver details
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Driver details</DialogTitle>
          <DialogDescription>Drivers are staff members of type “transport”. Invite them from Staff to give them the driver app.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <SelectField control={form.control} name="staffId" label="Staff member" options={staff} required />
          <FormGrid>
            <TextField control={form.control} name="licenseNo" label="Driving licence no" required />
            <TextField control={form.control} name="licenseExpiry" label="Licence valid until" type="date" required />
          </FormGrid>
          <SubmitButton pending={pending} size="default">
            Save
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeviceTokenDialog({ vehicles }: { vehicles: Option[] }) {
  const [open, setOpen] = useState(false);
  const [vehicle, setVehicle] = useState(vehicles[0]?.value ?? "");
  const [name, setName] = useState("GPS tracker");
  const [token, setToken] = useState<string | null>(null);
  const router = useRouter();
  const { run, pending } = useActionRunner();
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setToken(null); router.refresh(); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus aria-hidden /> Register GPS device
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register a GPS tracker</DialogTitle>
          <DialogDescription>The device sends fixes to POST /api/transport/telemetry with this token as a Bearer token. The token is shown only once.</DialogDescription>
        </DialogHeader>
        {token ? (
          <div className="grid gap-2">
            <div className="flex gap-2">
              <Input readOnly value={token} aria-label="Device token" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="icon" aria-label="Copy token" onClick={() => navigator.clipboard.writeText(token).then(() => toast.success("Copied"))}>
                <Copy />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Store it in the device configuration now. Revoke and re-register if it is lost.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={vehicle} onChange={(e) => setVehicle(e.target.value)} aria-label="Vehicle">
              {vehicles.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
            <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Device name" />
            <Button disabled={pending || !vehicle} onClick={() => run(() => createDeviceTokenAction(vehicle, name), { onSuccess: (d) => setToken(d.token) })}>
              Create token
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
