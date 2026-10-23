import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evaluateTripAlerts, liveTrip, recordFix, startTrip, tripManifest } from "@/lib/data/transport";
import { EMAILS, openTestDb, type TestDb } from "../helpers/fixture";

let t: TestDb;
let svm: string;
let r1: string;
let tripId: string;

beforeAll(async () => {
  t = await openTestDb();
  svm = (await t.service((sql) => sql.one<{ id: string }>("select id from schools where slug = 'sri-vidya-mandir'"))).id;
  r1 = (await t.service((sql) => sql.one<{ id: string }>("select id from transport_routes where school_id = $1 and code = 'R1'", [svm]))).id;
});
afterAll(() => t.close());

describe("driver trip lifecycle", () => {
  it("the assigned driver starts a real trip and shares location", async () => {
    const driver = await t.userId(EMAILS.svm.driver1);
    tripId = await t.as(EMAILS.svm.driver1, (sql) => startTrip(sql, { schoolId: svm, userId: driver }, r1, "pickup", false));
    const res = await t.as(EMAILS.svm.driver1, (sql) =>
      recordFix(sql, tripId, { latitude: 11.0265, longitude: 76.9443, speedKmh: 22, recordedAt: new Date().toISOString() }, "driver_app"),
    );
    expect(res.tripId).toBe(tripId);
    const manifest = await t.as(EMAILS.svm.driver1, (sql) => tripManifest(sql, tripId));
    expect(manifest.length).toBeGreaterThan(0);
    expect(Object.keys(manifest[0])).not.toContain("date_of_birth");
  });

  it("starting again returns the same running trip (one active trip per route)", async () => {
    const driver = await t.userId(EMAILS.svm.driver1);
    const again = await t.as(EMAILS.svm.driver1, (sql) => startTrip(sql, { schoolId: svm, userId: driver }, r1, "pickup", false));
    expect(again).toBe(tripId);
  });

  it("rejects simulator data on a real trip and future timestamps", async () => {
    await expect(t.as(EMAILS.svm.transport, (sql) => recordFix(sql, tripId, { latitude: 11, longitude: 76.9 }, "simulator"))).rejects.toThrow(/cannot be mixed/);
    await expect(
      t.as(EMAILS.svm.driver1, (sql) => recordFix(sql, tripId, { latitude: 11, longitude: 76.9, recordedAt: new Date(Date.now() + 3_600_000).toISOString() }, "driver_app")),
    ).rejects.toThrow(/future/);
  });

  it("another school's driver cannot post to this trip", async () => {
    await expect(t.as(EMAILS.gvp.driver1, (sql) => recordFix(sql, tripId, { latitude: 11, longitude: 76.9 }, "driver_app"))).rejects.toThrow();
  });

  it("a parent with a child on the route sees the live position and an ETA", async () => {
    const live = await t.as(EMAILS.svm.parent, (sql) => liveTrip(sql, tripId));
    expect(live).not.toBeNull();
    expect(live!.lastFix?.latitude).toBeCloseTo(11.0265, 4);
    expect(live!.connection).toBe("live");
    expect(live!.eta?.ok).toBe(true);
  });

  it("parents of other schools (and routes) cannot see the trip at all", async () => {
    expect(await t.as(EMAILS.gvp.parent, (sql) => liveTrip(sql, tripId))).toBeNull();
    const rows = await t.as(EMAILS.gvp.parent, (sql) => sql.many("select id from vehicle_location_events where trip_id = $1", [tripId]));
    expect(rows).toHaveLength(0);
  });

  it("raises a route deviation alert once when the vehicle leaves the route", async () => {
    await t.as(EMAILS.svm.driver1, (sql) => recordFix(sql, tripId, { latitude: 11.06, longitude: 76.9, speedKmh: 30, recordedAt: new Date().toISOString() }, "driver_app"));
    const first = await t.service((sql) => evaluateTripAlerts(sql, tripId));
    expect(first.map((a) => a.type)).toContain("route_deviation");
    const second = await t.service((sql) => evaluateTripAlerts(sql, tripId));
    expect(second.map((a) => a.type)).not.toContain("route_deviation");
  });

  it("after the trip ends, families lose access to its location history", async () => {
    await t.as(EMAILS.svm.driver1, (sql) => sql.exec("update transport_trips set status = 'completed', ended_at = now() where id = $1", [tripId]));
    const rows = await t.as(EMAILS.svm.parent, (sql) => sql.many("select id from vehicle_location_events where trip_id = $1", [tripId]));
    expect(rows).toHaveLength(0);
    const staff = await t.as(EMAILS.svm.transport, (sql) => sql.many("select id from vehicle_location_events where trip_id = $1", [tripId]));
    expect(staff.length).toBeGreaterThan(0);
    await expect(t.as(EMAILS.svm.driver1, (sql) => recordFix(sql, tripId, { latitude: 11, longitude: 76.9 }, "driver_app"))).rejects.toThrow(/ended/);
  });
});
