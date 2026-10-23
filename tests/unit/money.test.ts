import { describe, expect, it } from "vitest";
import {
  allocateOldestFirst,
  formatINR,
  formatINRCompact,
  outstanding,
  paiseToRupeeString,
  percentageOf,
  rupeesToPaise,
  splitIntoInstallments,
  validateAllocations,
} from "@/lib/domain/money";

const line = (id: string, due: string, amount: number, discount = 0, paid = 0) => ({ id, dueDate: due, amountPaise: amount, discountPaise: discount, paidPaise: paid });

describe("rupee parsing and formatting", () => {
  it("parses Indian-formatted input into paise without floating point errors", () => {
    expect(rupeesToPaise("12,500")).toBe(1_250_000);
    expect(rupeesToPaise("₹ 1,25,000.50")).toBe(12_500_050);
    expect(rupeesToPaise("0.1")).toBe(10);
    expect(rupeesToPaise("19.99")).toBe(1_999);
    expect(rupeesToPaise(33.3)).toBe(3_330);
  });
  it("rejects malformed amounts", () => {
    expect(() => rupeesToPaise("12.345")).toThrow();
    expect(() => rupeesToPaise("-5")).toThrow();
    expect(() => rupeesToPaise("abc")).toThrow();
  });
  it("formats with lakh/crore grouping", () => {
    expect(formatINR(12_500_050)).toBe("₹1,25,000.50");
    expect(formatINR(3_600_000, { whole: true })).toBe("₹36,000");
    expect(formatINRCompact(1_25_00_000)).toBe("₹1.25 L");
    expect(formatINRCompact(2_40_00_00_000)).toBe("₹2.4 Cr");
    expect(paiseToRupeeString(1205)).toBe("12.05");
  });
});

describe("percentages and installments", () => {
  it("rounds percentage discounts half-up to the paisa", () => {
    expect(percentageOf(1_200_000, 10)).toBe(120_000);
    expect(percentageOf(333, 50)).toBe(167); // 166.5 -> 167
    expect(percentageOf(1_000_001, 12.5)).toBe(125_000); // 125000.125 -> 125000
    expect(() => percentageOf(100, 101)).toThrow();
  });
  it("splits totals so installments always add up, remainder last", () => {
    const parts = splitIntoInstallments(10_000_001, 3);
    expect(parts).toEqual([3_333_333, 3_333_333, 3_333_335]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10_000_001);
  });
});

describe("allocation", () => {
  const lines = [line("t2", "2026-10-15", 1_300_000), line("t1", "2026-06-15", 1_300_000, 130_000, 500_000), line("act", "2026-07-15", 250_000)];

  it("computes outstanding as amount − discount − paid", () => {
    expect(outstanding(lines[1])).toBe(670_000);
  });
  it("allocates oldest due first and supports partial payments", () => {
    expect(allocateOldestFirst(800_000, lines)).toEqual([
      { feeLineId: "t1", amountPaise: 670_000 },
      { feeLineId: "act", amountPaise: 130_000 },
    ]);
  });
  it("refuses overpayment", () => {
    expect(() => allocateOldestFirst(670_000 + 250_000 + 1_300_000 + 1, lines)).toThrow(/exceeds/);
  });
  it("validates explicit allocations", () => {
    expect(validateAllocations([{ feeLineId: "act", amountPaise: 250_000 }], lines)).toBe(250_000);
    expect(() => validateAllocations([{ feeLineId: "act", amountPaise: 250_001 }], lines)).toThrow();
    expect(() => validateAllocations([{ feeLineId: "nope", amountPaise: 1 }], lines)).toThrow();
    expect(() => validateAllocations([{ feeLineId: "act", amountPaise: 1 }, { feeLineId: "act", amountPaise: 1 }], lines)).toThrow();
  });
});
