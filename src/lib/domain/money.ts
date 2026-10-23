/**
 * Money handling for INR.
 *
 * Every amount is an integer number of paise (1 rupee = 100 paise). Values are
 * kept below Number.MAX_SAFE_INTEGER (~90 trillion rupees), so plain numbers
 * are exact. Rounding rule: when a calculation produces a fraction of a paisa
 * (percentage discounts, equal installment splits) it is rounded half-up to the
 * nearest paisa, and any remainder from a split goes to the LAST installment.
 */

const MAX_PAISE = 100_000_000_00; // ₹10 crore per single amount: a sanity bound for school fees.

export class MoneyError extends Error {}

/** Parses user input such as "12,500", "12500.5" or "₹ 1,25,000.00" into paise. */
export function rupeesToPaise(input: string | number): number {
  const text = typeof input === "number" ? String(input) : input.replace(/[₹,\s]/g, "").replace(/^Rs\.?/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new MoneyError("Enter an amount in rupees with at most two decimal places");
  }
  const [whole, fraction = ""] = text.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise) || paise > MAX_PAISE) {
    throw new MoneyError("Amount is too large");
  }
  return paise;
}

/** Paise as a plain rupee string for form inputs ("12500.50"). */
export function paiseToRupeeString(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const inrWholeFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Indian formatting with lakh/crore grouping: 12500050 -> "₹1,25,000.50". */
export function formatINR(paise: number, opts: { whole?: boolean } = {}): string {
  if (opts.whole && paise % 100 === 0) return inrWholeFormatter.format(paise / 100);
  return inrFormatter.format(paise / 100);
}

/** Compact Indian notation for dashboards: ₹1.25 L, ₹2.4 Cr. */
export function formatINRCompact(paise: number): string {
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  if (abs >= 1_00_00_000) return `₹${trim(rupees / 1_00_00_000)} Cr`;
  if (abs >= 1_00_000) return `₹${trim(rupees / 1_00_000)} L`;
  if (abs >= 1_000) return `₹${trim(rupees / 1_000)} K`;
  return formatINR(paise, { whole: true });
}
function trim(n: number) {
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/** percent may have up to two decimals (e.g. 12.5). Rounds half-up to the paisa. */
export function percentageOf(paise: number, percent: number): number {
  if (percent < 0 || percent > 100) throw new MoneyError("Percentage must be between 0 and 100");
  const basisPoints = Math.round(percent * 100);
  return Math.floor((paise * basisPoints + 5_000) / 10_000);
}

/** Splits a total into n installments; the remainder goes to the last one. */
export function splitIntoInstallments(totalPaise: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > 12) throw new MoneyError("1 to 12 installments are supported");
  if (totalPaise < count) throw new MoneyError("Total is too small to split");
  const base = Math.floor(totalPaise / count);
  const parts = Array.from({ length: count }, () => base);
  parts[count - 1] += totalPaise - base * count;
  return parts;
}

export type FeeLine = {
  id: string;
  dueDate: string; // YYYY-MM-DD
  amountPaise: number;
  discountPaise: number;
  paidPaise: number;
};

export function netPayable(line: Pick<FeeLine, "amountPaise" | "discountPaise">): number {
  return line.amountPaise - line.discountPaise;
}

export function outstanding(line: FeeLine): number {
  return Math.max(0, netPayable(line) - line.paidPaise);
}

export type Allocation = { feeLineId: string; amountPaise: number };

/**
 * Allocates a payment across fee lines, oldest due date first. Rejects
 * overpayment: schools in this release do not hold advance credit balances.
 */
export function allocateOldestFirst(amountPaise: number, lines: FeeLine[]): Allocation[] {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new MoneyError("Payment amount must be positive");
  const open = lines
    .map((l) => ({ line: l, due: outstanding(l) }))
    .filter((x) => x.due > 0)
    .sort((a, b) => a.line.dueDate.localeCompare(b.line.dueDate) || a.line.id.localeCompare(b.line.id));
  const totalDue = open.reduce((s, x) => s + x.due, 0);
  if (amountPaise > totalDue) {
    throw new MoneyError(`Payment exceeds the outstanding balance of ${formatINR(totalDue)}`);
  }
  const result: Allocation[] = [];
  let remaining = amountPaise;
  for (const { line, due } of open) {
    if (remaining === 0) break;
    const take = Math.min(due, remaining);
    result.push({ feeLineId: line.id, amountPaise: take });
    remaining -= take;
  }
  return result;
}

/** Validates explicit allocations chosen by staff against current balances. */
export function validateAllocations(allocations: Allocation[], lines: FeeLine[]): number {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const seen = new Set<string>();
  let total = 0;
  for (const a of allocations) {
    if (seen.has(a.feeLineId)) throw new MoneyError("A fee item appears twice in the payment");
    seen.add(a.feeLineId);
    const line = byId.get(a.feeLineId);
    if (!line) throw new MoneyError("A selected fee item does not belong to this student");
    if (!Number.isSafeInteger(a.amountPaise) || a.amountPaise <= 0) throw new MoneyError("Allocated amounts must be positive");
    if (a.amountPaise > outstanding(line)) {
      throw new MoneyError(`Allocation exceeds the outstanding amount (${formatINR(outstanding(line))})`);
    }
    total += a.amountPaise;
  }
  if (total === 0) throw new MoneyError("Select at least one fee item");
  return total;
}
