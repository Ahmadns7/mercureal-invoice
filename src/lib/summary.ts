import { invoiceTotals } from "./money";
import { addMonths, monthKey } from "./dates";
import { invoiceCurrency, toNairaKobo } from "./fx";
import { EXPENSE_CATEGORIES, type AppData, type Currency, type ExpenseCategory, type FxRates, type Invoice } from "./types";

/** Invoice total in its own currency's minor units (kobo for NGN, cents for USD). */
export function invoiceTotalKobo(inv: Invoice): number {
  return invoiceTotals(
    inv.items.map((i) => ({ quantity: i.quantity, unitPriceKobo: i.unitPriceKobo })),
    inv.withVat,
  ).totalKobo;
}

/** Invoice total converted to naira kobo at the saved rates. Equal to invoiceTotalKobo for NGN invoices. */
export function invoiceNgnKobo(inv: Invoice, fxRates?: FxRates): number {
  return toNairaKobo(invoiceTotalKobo(inv), invoiceCurrency(inv), fxRates);
}

/** Recurring entries count in every month from their own month onward. */
function appliesIn(entryDate: string, recurring: boolean | undefined, month: string): boolean {
  const start = monthKey(entryDate);
  return recurring ? month >= start : start === month;
}

export interface DashboardTotals {
  invoicedKobo: number;
  paidKobo: number;
  outstandingKobo: number;
  expensesKobo: number;
  otherIncomeKobo: number;
  profitKobo: number;
}

/**
 * Totals for the dashboard. Profit is cash basis for `today`'s month:
 * invoice payments plus other income received, minus expenses, all for that month.
 * Foreign-currency invoices are shown in naira at the saved rates.
 */
export function dashboardTotals(data: AppData, today: string): DashboardTotals {
  const month = monthKey(today);
  let invoiced = 0;
  let paid = 0;
  let outstanding = 0;
  let paidThisMonth = 0;
  for (const inv of data.invoices) {
    const total = invoiceNgnKobo(inv, data.fxRates);
    if (monthKey(inv.issueDate) === month) invoiced += total;
    if (inv.status === "paid") {
      paid += total;
      if (inv.paidDate && monthKey(inv.paidDate) === month) paidThisMonth += total;
    } else {
      outstanding += total;
    }
  }
  const expenses = data.expenses
    .filter((e) => appliesIn(e.date, e.recurring, month))
    .reduce((s, e) => s + e.amountKobo, 0);
  const otherIncome = data.incomes
    .filter((i) => appliesIn(i.date, i.recurring, month))
    .reduce((s, i) => s + i.amountKobo, 0);
  return {
    invoicedKobo: invoiced,
    paidKobo: paid,
    outstandingKobo: outstanding,
    expensesKobo: expenses,
    otherIncomeKobo: otherIncome,
    profitKobo: paidThisMonth + otherIncome - expenses,
  };
}

export interface MonthRow {
  month: string;
  invoicedKobo: number;
  paidKobo: number;
  otherIncomeKobo: number;
  expensesKobo: number;
  profitKobo: number;
}

/** Per-month rollup, newest month first. Recurring rows fill every month from their start through the latest logged month. */
export function monthlySummary(data: AppData, _today?: string): MonthRow[] {
  const dates: string[] = [];
  for (const inv of data.invoices) {
    dates.push(monthKey(inv.issueDate));
    if (inv.paidDate) dates.push(monthKey(inv.paidDate));
  }
  for (const e of data.expenses) dates.push(monthKey(e.date));
  for (const i of data.incomes) dates.push(monthKey(i.date));
  if (dates.length === 0) return [];
  const last = dates.reduce((a, b) => (a > b ? a : b));
  const keys = new Set(dates);
  // Recurring entries reach the latest month; expand their months.
  for (const e of data.expenses) if (e.recurring) for (let m = monthKey(e.date); m <= last; m = addMonths(m, 1)) keys.add(m);
  for (const i of data.incomes) if (i.recurring) for (let m = monthKey(i.date); m <= last; m = addMonths(m, 1)) keys.add(m);

  const rows = new Map<string, MonthRow>();
  for (const m of keys) rows.set(m, { month: m, invoicedKobo: 0, paidKobo: 0, otherIncomeKobo: 0, expensesKobo: 0, profitKobo: 0 });
  const row = (m: string) => rows.get(m)!;
  for (const inv of data.invoices) {
    const ngn = invoiceNgnKobo(inv, data.fxRates);
    row(monthKey(inv.issueDate)).invoicedKobo += ngn;
    if (inv.status === "paid" && inv.paidDate) row(monthKey(inv.paidDate)).paidKobo += ngn;
  }
  for (const e of data.expenses) {
    for (const m of keys) if (appliesIn(e.date, e.recurring, m)) row(m).expensesKobo += e.amountKobo;
  }
  for (const i of data.incomes) {
    for (const m of keys) if (appliesIn(i.date, i.recurring, m)) row(m).otherIncomeKobo += i.amountKobo;
  }
  for (const r of rows.values()) r.profitKobo = r.paidKobo + r.otherIncomeKobo - r.expensesKobo;
  return [...rows.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}

export interface CategoryTotal {
  category: ExpenseCategory;
  kobo: number;
}

/** Expense totals per category for the given months, largest first (zero categories omitted). */
export function categoryTotals(data: AppData, months: string[]): CategoryTotal[] {
  const totals = new Map<ExpenseCategory, number>(EXPENSE_CATEGORIES.map((c) => [c, 0]));
  for (const e of data.expenses) {
    const n = occurrencesIn(e, months);
    if (n > 0) totals.set(e.category, (totals.get(e.category) ?? 0) + e.amountKobo * n);
  }
  return [...totals.entries()]
    .filter(([, kobo]) => kobo > 0)
    .map(([category, kobo]) => ({ category, kobo }))
    .sort((a, b) => b.kobo - a.kobo);
}

/** How many of the given months an entry (one-off or recurring) lands in. */
export function occurrencesIn(entry: { date: string; recurring?: boolean }, months: string[]): number {
  return months.filter((m) => appliesIn(entry.date, entry.recurring, m)).length;
}

/** Per-month rows for the given "YYYY-MM" keys, oldest first (months with no data are zero rows). */
export function monthRows(data: AppData, months: string[]): MonthRow[] {
  const all = new Map(monthlySummary(data).map((r) => [r.month, r]));
  return months.map((m) => all.get(m) ?? { month: m, invoicedKobo: 0, paidKobo: 0, otherIncomeKobo: 0, expensesKobo: 0, profitKobo: 0 });
}

export type { Currency };
