import { invoiceTotals } from "./money";
import { monthKey } from "./dates";
import type { AppData, Invoice } from "./types";

export function invoiceTotalKobo(inv: Invoice): number {
  return invoiceTotals(
    inv.items.map((i) => ({ quantity: i.quantity, unitPriceKobo: i.unitPriceKobo })),
    inv.withVat,
  ).totalKobo;
}

export interface DashboardTotals {
  invoicedKobo: number;
  paidKobo: number;
  outstandingKobo: number;
  expensesKobo: number;
  profitKobo: number;
}

/**
 * Totals for the dashboard. Profit is cash basis for the current month:
 * payments received this month minus expenses logged this month.
 */
export function dashboardTotals(data: AppData, today: string): DashboardTotals {
  const month = monthKey(today);
  let invoiced = 0;
  let paid = 0;
  let outstanding = 0;
  let paidThisMonth = 0;
  for (const inv of data.invoices) {
    const total = invoiceTotalKobo(inv);
    if (inv.issueDate.startsWith(month)) invoiced += total;
    if (inv.status === "paid") {
      paid += total;
      if (inv.paidDate && monthKey(inv.paidDate) === month) paidThisMonth += total;
    } else {
      outstanding += total;
    }
  }
  const expenses = data.expenses
    .filter((e) => monthKey(e.date) === month)
    .reduce((s, e) => s + e.amountKobo, 0);
  return {
    invoicedKobo: invoiced,
    paidKobo: paid,
    outstandingKobo: outstanding,
    expensesKobo: expenses,
    profitKobo: paidThisMonth - expenses,
  };
}

export interface MonthRow {
  month: string;
  invoicedKobo: number;
  paidKobo: number;
  expensesKobo: number;
}

/** Per-month rollup across all data, newest month first. */
export function monthlySummary(data: AppData): MonthRow[] {
  const rows = new Map<string, MonthRow>();
  const row = (m: string) => {
    let r = rows.get(m);
    if (!r) {
      r = { month: m, invoicedKobo: 0, paidKobo: 0, expensesKobo: 0 };
      rows.set(m, r);
    }
    return r;
  };
  for (const inv of data.invoices) {
    row(monthKey(inv.issueDate)).invoicedKobo += invoiceTotalKobo(inv);
    if (inv.status === "paid" && inv.paidDate) {
      row(monthKey(inv.paidDate)).paidKobo += invoiceTotalKobo(inv);
    }
  }
  for (const e of data.expenses) row(monthKey(e.date)).expensesKobo += e.amountKobo;
  return [...rows.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}
