import { parseNairaToKobo } from "./money";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "./types";

/** What the vision model is asked to return. amount_kobo is integer kobo in the stated currency's minor units. */
export interface ReceiptFields {
  vendor: string;
  amountKobo: number | null;
  date: string | null;
  category: ExpenseCategory;
  currency: "NGN" | "USD" | "GBP" | "EUR";
}

export const RECEIPT_PROMPT =
  'Read this receipt. Reply with ONLY a JSON object, no prose: {"vendor": string, "amount_kobo": integer (total paid in minor units, kobo for NGN, cents otherwise, 0 if unknown), "date": "YYYY-MM-DD" or null, "category": one of ' +
  EXPENSE_CATEGORIES.map((c) => `"${c}"`).join(", ") +
  ', "currency": "NGN"|"USD"|"GBP"|"EUR"}.';

/** Pull the first JSON object out of a model reply and validate it. Returns null when unusable. */
export function parseReceiptJson(reply: string): ReceiptFields | null {
  const m = /\{[\s\S]*\}/.exec(reply);
  if (!m) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const vendor = typeof obj.vendor === "string" ? obj.vendor.trim() : "";
  const rawAmt = obj.amount_kobo;
  const amountKobo = typeof rawAmt === "number" && Number.isFinite(rawAmt) && rawAmt > 0 ? Math.round(rawAmt) : null;
  const date = typeof obj.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.date) ? obj.date : null;
  const cat = typeof obj.category === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(obj.category)
    ? (obj.category as ExpenseCategory)
    : "Other";
  const cur = obj.currency === "USD" || obj.currency === "GBP" || obj.currency === "EUR" ? obj.currency : "NGN";
  return { vendor, amountKobo, date, category: cat, currency: cur };
}

/** Naira kobo from a user-typed amount (for manual entry from a photo). */
export function manualAmount(input: string): number | null {
  return parseNairaToKobo(input);
}

/** Payment link must be an https URL to a Paystack or Flutterwave host, or empty to clear. */
export function validatePaymentLink(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = raw.trim();
  if (v === "") return { ok: true, value: "" };
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return { ok: false, error: "Enter a full link starting with https://" };
  }
  if (u.protocol !== "https:") return { ok: false, error: "Payment links must use https://" };
  return { ok: true, value: u.toString() };
}

/** Human check that a link is from Paystack or Flutterwave (warning only, not a block). */
export function isKnownProcessor(url: string): boolean {
  return /(paystack\.(com|shop)|flutterwave\.com|flw\.|checkout\.flutterwave)/i.test(url);
}
