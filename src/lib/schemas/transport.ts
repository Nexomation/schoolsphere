import { z } from "zod";
import { isoDate, optionalIsoDate, optionalUuid, uuid } from "./common";

export const vehicleInput = z.object({
  id: optionalUuid,
  registrationNo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9 -]{4,15}$/, "e.g. TN 37 AB 1234"),
  vehicleType: z.enum(["bus", "mini_bus", "van"]),
  capacity: z.coerce.number().int().min(1).max(100),
  makeModel: z.string().trim().max(80).optional().transform((v) => v || null),
  insuranceExpiry: optionalIsoDate,
  fitnessExpiry: optionalIsoDate,
  permitExpiry: optionalIsoDate,
  status: z.enum(["active", "maintenance", "inactive"]).default("active"),
});

export const driverInput = z.object({
  staffId: uuid,
  licenseNo: z.string().trim().min(5).max(30),
  licenseExpiry: isoDate,
});

export const routeInput = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,12}$/, "Short code, e.g. R3"),
  vehicleId: optionalUuid,
  driverId: optionalUuid,
  attendantStaffId: optionalUuid,
});

const time = z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]).optional().transform((v) => v || null);

export const stopInput = z.object({
  routeId: uuid,
  id: optionalUuid,
  name: z.string().trim().min(2).max(120),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  pickupTime: time,
  dropTime: time,
});

export const studentRouteInput = z.object({
  studentId: uuid,
  routeId: uuid,
  stopId: uuid,
  usesPickup: z.boolean().default(true),
  usesDrop: z.boolean().default(true),
});

/** One GPS fix from a device, the driver's phone or the simulator. */
export const telemetryInput = z.object({
  tripId: z.uuid().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speedKmh: z.number().min(0).max(200).nullish(),
  heading: z.number().min(0).max(360).nullish(),
  accuracyM: z.number().min(0).max(10_000).nullish(),
  recordedAt: z.iso.datetime({ offset: true }).optional(),
  source: z.enum(["device", "driver_app", "simulator"]).optional(),
});
export type TelemetryInput = z.output<typeof telemetryInput>;
