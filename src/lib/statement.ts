import { daysBetween, isOverdue } from "./dates";
import { invoiceTotalKobo } from "./summary";
import type { AppData, Client, Invoice } from "./types";

export interface StatementRow {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string;
  totalKobo: number;
  status: "paid" | "unpaid";
  paidDate?: string;
  paymentMethod?: Invoice["paymentMethod"];
  overdue: boolean;
}

export interface ClientStatement {
  client: Client;
  rows: StatementRow[];
  billedKobo: number;
  paidKobo: number;
  outstandingKobo: number;
  overdueKobo: number;
}

/** Every invoice for one client with paid/outstanding totals. Payment is recorded per invoice (no partial payments). */
export function clientStatement(data: AppData, clientId: string, today: string): ClientStatement | null {
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) return null;
  const invoices = data.invoices
    .filter((i) => i.clientId === clientId)
    .sort((a, b) => (a.issueDate < b.issueDate ? -1 : a.issueDate > b.issueDate ? 1 : 0));
  const rows: StatementRow[] = invoices.map((inv) => ({
    id: inv.id,
    number: inv.number,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    totalKobo: invoiceTotalKobo(inv),
    status: inv.status,
    paidDate: inv.paidDate,
    paymentMethod: inv.paymentMethod,
    overdue: isOverdue(inv.dueDate, inv.status, today),
  }));
  let billed = 0;
  let paid = 0;
  let overdue = 0;
  for (const r of rows) {
    billed += r.totalKobo;
    if (r.status === "paid") paid += r.totalKobo;
    if (r.overdue) overdue += r.totalKobo;
  }
  return { client, rows, billedKobo: billed, paidKobo: paid, outstandingKobo: billed - paid, overdueKobo: overdue };
}

export interface ClientSummary {
  clientId: string;
  name: string;
  billedKobo: number;
  paidKobo: number;
  outstandingKobo: number;
  overdueCount: number;
}

/** One row per client, most money outstanding first (ties by billed). */
export function clientSummaries(data: AppData, today: string): ClientSummary[] {
  return data.clients
    .map((c) => {
      const invoices = data.invoices.filter((i) => i.clientId === c.id);
      let billed = 0;
      let paid = 0;
      let overdueCount = 0;
      for (const inv of invoices) {
        const total = invoiceTotalKobo(inv);
        billed += total;
        if (inv.status === "paid") paid += total;
        if (isOverdue(inv.dueDate, inv.status, today)) overdueCount++;
      }
      return { clientId: c.id, name: c.name, billedKobo: billed, paidKobo: paid, outstandingKobo: billed - paid, overdueCount };
    })
    .sort((a, b) => b.outstandingKobo - a.outstandingKobo || b.billedKobo - a.billedKobo);
}

/** Unpaid invoices past due, oldest due date first. */
export function overdueInvoices(data: AppData, today: string): Invoice[] {
  return data.invoices
    .filter((i) => isOverdue(i.dueDate, i.status, today))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
}

/** Days past due for an unpaid invoice (positive = overdue, negative = still due). */
export function daysPastDue(dueDate: string, today: string): number {
  return daysBetween(dueDate, today);
}
