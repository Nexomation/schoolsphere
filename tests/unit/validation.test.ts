import { describe, expect, it } from "vitest";
import { sanitizeCell, toCsv } from "@/lib/csv";
import { indianPhone, normaliseDate } from "@/lib/schemas/common";
import { offlinePaymentInput } from "@/lib/schemas/fees";
import { telemetryInput } from "@/lib/schemas/transport";
import { admissionInput } from "@/lib/schemas/students";
import { can } from "@/lib/auth/permissions";
import { validateUpload } from "@/lib/storage";

describe("input validation used by actions and APIs", () => {
  it("normalises Indian mobile numbers", () => {
    expect(indianPhone.parse("98765 43210")).toBe("+919876543210");
    expect(indianPhone.parse("+91-98765-43210")).toBe("+919876543210");
    expect(indianPhone.parse("09876543210")).toBe("+919876543210");
    expect(indianPhone.safeParse("12345").success).toBe(false);
    expect(indianPhone.safeParse("5876543210").success).toBe(false);
  });

  it("parses Indian and ISO dates strictly", () => {
    expect(normaliseDate("05/06/2014")).toBe("2014-06-05");
    expect(normaliseDate("2014-06-05")).toBe("2014-06-05");
    expect(normaliseDate("31/02/2014")).toBeNull();
    expect(normaliseDate("June 5")).toBeNull();
  });

  it("validates telemetry payloads", () => {
    expect(telemetryInput.safeParse({ tripId: crypto.randomUUID(), latitude: 11.0, longitude: 76.9, speedKmh: 30 }).success).toBe(true);
    expect(telemetryInput.safeParse({ latitude: 95, longitude: 76.9 }).success).toBe(false);
    expect(telemetryInput.safeParse({ latitude: 11, longitude: 76.9, speedKmh: 500 }).success).toBe(false);
    expect(telemetryInput.safeParse({ latitude: "11", longitude: 76.9 }).success).toBe(false);
  });

  it("converts payment amounts to paise and drops zero allocations", () => {
    const r = offlinePaymentInput.parse({
      studentId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      method: "cash",
      paidOn: "2026-10-22",
      allocations: [
        { lineId: crypto.randomUUID(), amount: "1,250.50" },
        { lineId: crypto.randomUUID(), amount: "0" },
      ],
    });
    expect(r.allocations).toEqual([{ lineId: expect.any(String), amount: 125050 }]);
    expect(offlinePaymentInput.safeParse({ studentId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), method: "bitcoin", paidOn: "2026-10-22", allocations: [] }).success).toBe(false);
  });

  it("rejects incomplete admissions", () => {
    const r = admissionInput.safeParse({ firstName: "", admissionNo: "A 1", dateOfBirth: "2014-01-01", gender: "male", admissionDate: "2026-06-01", sectionId: "x", guardian: { fullName: "R", relationship: "father", phone: "1" } });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.length).toBeGreaterThan(3);
  });

  it("neutralises spreadsheet formula injection in CSV exports", () => {
    expect(sanitizeCell("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(sanitizeCell("+91 98765")).toBe("'+91 98765");
    expect(sanitizeCell("Meera")).toBe("Meera");
    expect(toCsv([{ a: "=1+1", b: "தமிழ்" }], [{ key: "a", header: "a" }, { key: "b", header: "b" }])).toContain("'=1+1");
  });

  it("checks uploads by type, extension, size and content", () => {
    const pdf = Buffer.from("%PDF-1.7 test");
    expect(validateUpload("a.pdf", "application/pdf", pdf)).toBeNull();
    expect(validateUpload("a.exe", "application/pdf", pdf)).not.toBeNull();
    expect(validateUpload("a.pdf", "application/pdf", Buffer.from("MZ fake"))).toMatch(/do not match/);
    expect(validateUpload("a.png", "image/png", Buffer.alloc(11 * 1024 * 1024, 1))).toMatch(/10 MB/);
  });

  it("encodes the permission matrix", () => {
    expect(can("teacher", "attendance.mark")).toBe(true);
    expect(can("parent", "attendance.mark")).toBe(false);
    expect(can("driver", "students.view")).toBe(false);
    expect(can("accountant", "payments.record")).toBe(true);
    expect(can("student", "fees.view")).toBe(false);
    expect(can("parent", "payments.pay")).toBe(true);
  });
});
