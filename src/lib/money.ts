export const VAT_BASIS_POINTS = 750; // 7.5% in basis points
export const VAT_PERCENT_LABEL = "7.5%";

/** Parse a naira string like "1,250.50" into integer kobo. Returns null if invalid. */
export function parseNairaToKobo(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Format integer kobo as "₦1,250.50". */
export function formatNaira(kobo: number): string {
  const sign = kobo < 0 ? "-" : "";
  const abs = Math.abs(Math.round(kobo));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}₦${whole.toLocaleString("en-US")}.${frac}`;
}

/** Parse a quantity string. Must be a positive whole or decimal number. */
export function parseQuantity(input: string): number | null {
  const n = Number(input.trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Line total in kobo: quantity * unit price, rounded to the nearest kobo. */
export function lineTotalKobo(quantity: number, unitPriceKobo: number): number {
  return Math.round(quantity * unitPriceKobo);
}

/** VAT in kobo on a subtotal, rounded to the nearest kobo. */
export function vatKobo(subtotalKobo: number): number {
  return Math.round((subtotalKobo * VAT_BASIS_POINTS) / 10000);
}

export interface InvoiceTotals {
  subtotalKobo: number;
  vatKobo: number;
  totalKobo: number;
}

export function invoiceTotals(
  lines: { quantity: number; unitPriceKobo: number }[],
  withVat: boolean,
): InvoiceTotals {
  const subtotalKobo = lines.reduce(
    (sum, l) => sum + lineTotalKobo(l.quantity, l.unitPriceKobo),
    0,
  );
  const vat = withVat ? vatKobo(subtotalKobo) : 0;
  return { subtotalKobo, vatKobo: vat, totalKobo: subtotalKobo + vat };
}
