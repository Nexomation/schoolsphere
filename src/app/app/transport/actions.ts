"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { requireActionContext } from "@/lib/auth/context";
import { createToken } from "@/lib/auth/password";
import { can } from "@/lib/auth/permissions";
import { familyUserIds, notifyUsers } from "@/lib/data/notifications";
import { schoolToday } from "@/lib/data/school";
import {
  assignStudentToRoute,
  deleteStop,
  endStudentAssignment,
  endTrip,
  moveStop,
  recordStudentEvent,
  saveDriver,
  saveRoute,
  saveStop,
  saveVehicle,
  startTrip,
} from "@/lib/data/transport";
import { formatTime } from "@/lib/domain/dates";
import { env } from "@/lib/env";
import { ForbiddenError } from "@/lib/errors";
import { driverInput, routeInput, stopInput, studentRouteInput, vehicleInput } from "@/lib/schemas/transport";

const paths = () => {
  revalidatePath("/app/transport", "layout");
  revalidatePath("/app/driver");
};

export async function saveVehicleAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("transport.manage");
    const data = parseInput(vehicleInput, input);
    await ctx.db((sql) => saveVehicle(sql, ctx.schoolId, data));
    paths();
    return ok(null, data.id ? "Vehicle updated" : "Vehicle added");
  });
}

export async function saveDriverAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("transport.manage");
    const data = parseInput(driverInput, input);
    await ctx.db((sql) => saveDriver(sql, ctx.schoolId, data));
    paths();
    return ok(null, "Driver details saved");
  });
}

export async function saveRouteAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("transport.manage");
    const data = parseInput(routeInput, input);
    const id = await ctx.db((sql) => saveRoute(sql, ctx.schoolId, data));
    paths();
    return ok({ id }, data.id ? "Route updated" : "Route created");
  });
}

export async function saveStopAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("transport.manage");
    const data = parseInput(stopInput, input);
    await ctx.db((sql) => saveStop(sql, ctx.schoolId, data));
    paths();
    return ok(null, data.id ? "Stop updated" : "Stop added");
  });
}

export async function moveStopAction(stopId: string, direction: -1 | 1): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("transport.manage");
    await ctx.db((sql) => moveStop(sql, ctx.schoolId, z.uuid().parse(stopId), direction === -1 ? -1 : 1));
    paths();
    return ok(null, "Stop order updated");
  });
}

export async function deleteStopAction(stopId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("transport.manage");
    await ctx.db((sql) => deleteStop(sql, ctx.schoolId, z.uuid().parse(stopId)));
    paths();
    return ok(null, "Stop removed");
  });
}

export async function assignStudentAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("transport.manage");
    const data = parseInput(studentRouteInput, input);
    await ctx.db(async (sql) => assignStudentToRoute(sql, ctx.schoolId, data, await schoolToday(sql, ctx.schoolId)));
    paths();
    return ok(null, "Student assigned to the route");
  });
}

export async function endAssignmentAction(assignmentId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("transport.manage");
    await ctx.db(async (sql) => endStudentAssignment(sql, ctx.schoolId, z.uuid().parse(assignmentId), await schoolToday(sql, ctx.schoolId)));
    paths();
    return ok(null, "Student removed from the route");
  });
}

export async function createDeviceTokenAction(vehicleId: string, name: string): Promise<ActionResult<{ token: string }>> {
  return runAction(async () => {
    const ctx = await requireActionContext("transport.manage");
    const { token, hash } = createToken();
    await ctx.db((sql) =>
      sql.exec("insert into tracking_devices (school_id, vehicle_id, name, token_hash) values ($1, $2, $3, $4)", [
        ctx.schoolId,
        z.uuid().parse(vehicleId),
        z.string().trim().min(2).max(60).parse(name),
        hash,
      ]),
    );
    paths();
    // The plain token is shown once; only its hash is stored.
    return ok({ token }, "Device token created");
  });
}

export async function revokeDeviceAction(deviceId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("transport.manage");
    await ctx.db((sql) => sql.exec("update tracking_devices set revoked_at = now() where id = $1 and school_id = $2", [z.uuid().parse(deviceId), ctx.schoolId]));
    paths();
    return ok(null, "Device revoked");
  });
}

export async function startTripAction(routeId: string, tripType: "pickup" | "drop", simulated = false): Promise<ActionResult<{ tripId: string }>> {
  return runAction(async () => {
    const ctx = await requireActionContext();
    if (simulated) {
      if (!env().TRANSPORT_SIMULATOR_ENABLED) throw new ForbiddenError("The location simulator is disabled.");
      if (!can(ctx.role, "transport.manage")) throw new ForbiddenError();
    } else if (!can(ctx.role, "transport.drive") && !can(ctx.role, "transport.manage")) {
      throw new ForbiddenError();
    }
    const tripId = await ctx.db((sql) => startTrip(sql, ctx, z.uuid().parse(routeId), z.enum(["pickup", "drop"]).parse(tripType), simulated));
    paths();
    return ok({ tripId }, simulated ? "Simulated trip started" : "Trip started");
  });
}

export async function endTripAction(tripId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext();
    if (!can(ctx.role, "transport.drive") && !can(ctx.role, "transport.manage")) throw new ForbiddenError();
    await ctx.db((sql) => endTrip(sql, z.uuid().parse(tripId)));
    paths();
    return ok(null, "Trip ended");
  });
}

export async function studentEventAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext();
    if (!can(ctx.role, "transport.drive") && !can(ctx.role, "transport.manage")) throw new ForbiddenError();
    const data = parseInput(
      z.object({
        tripId: z.uuid(),
        studentId: z.uuid(),
        eventType: z.enum(["boarded", "dropped", "not_present"]),
        latitude: z.number().nullish(),
        longitude: z.number().nullish(),
      }),
      input,
    );
    const name = await ctx.db(async (sql) => {
      await recordStudentEvent(sql, ctx, data);
      return (await sql.one<{ name: string }>("select student_name as name from get_trip_manifest($1) where student_id = $2", [data.tripId, data.studentId])).name.split(" ")[0];
    });
    const families = await familyUserIds([data.studentId]);
    const verb = data.eventType === "boarded" ? "boarded the school van" : data.eventType === "dropped" ? "was dropped off" : "was marked not present at the stop";
    await notifyUsers(
      { schoolId: ctx.schoolId, userIds: families.get(data.studentId) ?? [], type: "transport", title: `${name} ${verb}`, body: `At ${formatTime(new Date().toISOString())}.`, link: "/app/transport" },
      ctx.userId,
    );
    paths();
    return ok(null, data.eventType === "boarded" ? "Marked as boarded" : data.eventType === "dropped" ? "Marked as dropped" : "Marked not present");
  });
}
