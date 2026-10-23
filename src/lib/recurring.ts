import { addMonths, monthKey } from "./dates";
import { nextInvoiceNumber } from "./invoiceNumber";
import { invoiceCurrency, toNairaKobo } from "./fx";
import { invoiceTotals } from "./money";
import type { Currency, FxRates, Invoice } from "./types";

/**
 * Clone a monthly template into a new invoice for the month of `today`.
 * Gets a fresh number (next after the highest existing in that year), issue date = first of the month,
 * due date keeps its original offset from the template's issue date, status resets to unpaid.
 */
export function cloneTemplate(tpl: Invoice, all: Invoice[], today: string, newId: string = crypto.randomUUID()): Invoice {
  const month = monthKey(today);
  const issueDate = `${month}-01`;
  const offsetDays = dayOffset(tpl.issueDate, tpl.dueDate);
  const dueDate = addDays(issueDate, offsetDays);
  const year = Number(month.slice(0, 4));
  const number = nextInvoiceNumber(all.map((i) => i.number), year);
  return {
    ...tpl,
    id: newId,
    number,
    issueDate,
    dueDate,
    status: "unpaid",
    paidDate: undefined,
    paymentMethod: undefined,
    monthlyTemplate: false,
    generatedFrom: tpl.id,
  };
}

/** True when a template already produced an invoice this month (so the action is not offered twice). */
export function hasGeneratedFor(all: Invoice[], templateId: string, month: string): boolean {
  return all.some((i) => i.generatedFrom === templateId && monthKey(i.issueDate) === month);
}

/** Templates that still need generating for the month, sorted by client-facing number. */
export function templatesDue(all: Invoice[], month: string): Invoice[] {
  return all.filter((i) => i.monthlyTemplate && !hasGeneratedFor(all, i.id, month));
}

/** Days from issue to due, never negative. */
export function dayOffset(issue: string, due: string): number {
  const ms = Date.parse(`${due}T00:00:00Z`) - Date.parse(`${issue}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86400000));
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export { addMonths };

/** Calendar quarter label for a date, e.g. "2026-Q4" for 2026-10-23. */
export function quarterOf(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

export function quarterLabel(quarter: string): string {
  const [y, q] = quarter.split("-Q");
  return `Q${q} ${y}`;
}

export interface VatQuarterLine {
  id: string;
  number: string;
  issueDate: string;
  currency: Currency;
  subtotalMinor: number;
  vatMinor: number;
  vatNgnKobo: number;
  paid: boolean;
}

export interface VatQuarter {
  quarter: string;
  label: string;
  invoiceCount: number;
  taxableNgnKobo: number;
  vatNgnKobo: number;
  lines: VatQuarterLine[];
}

/** Output VAT grouped by calendar quarter of issue date, newest first. Only VAT invoices count. */
export function vatByQuarter(invoices: Invoice[], fxRates?: FxRates): VatQuarter[] {
  const byQ = new Map<string, VatQuarter>();
  for (const inv of invoices) {
    if (!inv.withVat) continue;
    const q = quarterOf(inv.issueDate);
    const cur = invoiceCurrency(inv);
    const t = invoiceTotals(inv.items.map((i) => ({ quantity: i.quantity, unitPriceKobo: i.unitPriceKobo })), true);
    const line: VatQuarterLine = {
      id: inv.id,
      number: inv.number,
      issueDate: inv.issueDate,
      currency: cur,
      subtotalMinor: t.subtotalKobo,
      vatMinor: t.vatKobo,
      vatNgnKobo: toNairaKobo(t.vatKobo, cur, fxRates),
      paid: inv.status === "paid",
    };
    const bucket = byQ.get(q) ?? { quarter: q, label: quarterLabel(q), invoiceCount: 0, taxableNgnKobo: 0, vatNgnKobo: 0, lines: [] };
    bucket.invoiceCount += 1;
    bucket.taxableNgnKobo += toNairaKobo(t.subtotalKobo, cur, fxRates);
    bucket.vatNgnKobo += line.vatNgnKobo;
    bucket.lines.push(line);
    byQ.set(q, bucket);
  }
  return [...byQ.values()].sort((a, b) => (a.quarter < b.quarter ? 1 : -1));
}
