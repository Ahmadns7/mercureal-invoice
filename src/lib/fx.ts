import { formatNaira } from "./money";
import { type AppData, type Currency, type FxRates, type Invoice } from "./types";

/** Starting rates only. The user is expected to update them in Settings. */
export const DEFAULT_FX: Record<Exclude<Currency, "NGN">, number> = { USD: 1500, GBP: 1900, EUR: 1650 };

const SYMBOL: Record<Currency, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };

/** Full rate table with NGN fixed at 1. Missing or invalid saved rates fall back to the defaults. */
export function rateTable(rates?: FxRates): Record<Currency, number> {
  const pick = (c: Exclude<Currency, "NGN">) => {
    const r = rates?.[c];
    return typeof r === "number" && Number.isFinite(r) && r > 0 ? r : DEFAULT_FX[c];
  };
  return { NGN: 1, USD: pick("USD"), GBP: pick("GBP"), EUR: pick("EUR") };
}

export function invoiceCurrency(inv: Pick<Invoice, "currency">): Currency {
  return inv.currency ?? "NGN";
}

/**
 * Convert an amount in minor units (kobo or cents) to naira kobo.
 * Minor units times naira-per-major-unit gives kobo, because 1 major = 100 minor and 1 naira = 100 kobo.
 */
export function toNairaKobo(minor: number, currency: Currency, rates?: FxRates): number {
  return Math.round(minor * rateTable(rates)[currency]);
}

/** Format minor units in the given currency, e.g. "$1,250.50". NGN keeps the user's display preference. */
export function formatMoney(minor: number, currency: Currency): string {
  if (currency === "NGN") return formatNaira(minor);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minor));
  const body = (abs / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}${SYMBOL[currency]}${body}`;
}

export function ratesFor(data: Pick<AppData, "fxRates">): Record<Currency, number> {
  return rateTable(data.fxRates);
}
