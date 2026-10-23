import { koboToMajor } from "../money";
import { monthKey, monthRange, addMonths } from "../dates";
import { dashboardTotals, monthlySummary, categoryTotals, invoiceTotalKobo } from "../summary";
import { clientSummaries, daysPastDue } from "../statement";
import { budgetStatus } from "../budgets";
import type { AppData } from "../types";

/**
 * The ONLY view of the user's books the assistant receives. Every amount is a
 * plain major-unit number (naira), and nothing from settings, storage keys or
 * the API key is included. Keep this compact: it is sent on every chat turn.
 */
export interface FinanceSummary {
  asOf: string;
  currency: "NGN";
  thisMonth: {
    month: string;
    invoiced: number;
    paidIn: number;
    otherIncome: number;
    expenses: number;
    profitCash: number;
    outstanding: number;
  };
  byMonth: { month: string; invoiced: number; paidIn: number; otherIncome: number; expenses: number; profit: number }[];
  expensesByCategory: { category: string; amount: number; sharePct: number }[];
  budgets: { category: string; cap: number; spent: number; usedPct: number; over: boolean }[];
  topClientsOutstanding: { name: string; billed: number; paid: number; outstanding: number; overdueInvoices: number }[];
  outstandingInvoices: { number: string; client: string; amount: number; due: string; daysPastDue: number }[];
  recurring: { monthlyExpenses: number; monthlyIncome: number; items: { kind: "expense" | "income"; description: string; amount: number }[] };
  counts: { clients: number; invoices: number; expenses: number; incomes: number };
}

const MAX_MONTHS = 12;
const MAX_CLIENTS = 8;
const MAX_OUTSTANDING = 20;

/** Build the compact, numbers-only summary of the user's books. Pure: no I/O, no secrets. */
export function buildFinanceSummary(data: AppData, today: string): FinanceSummary {
  const month = monthKey(today);
  const totals = dashboardTotals(data, today);

  const months = monthRange(addMonths(month, -(MAX_MONTHS - 1)), month);
  const byMonth = monthlySummary(data)
    .filter((r) => months.includes(r.month))
    .slice(0, MAX_MONTHS)
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map((r) => ({
      month: r.month,
      invoiced: koboToMajor(r.invoicedKobo),
      paidIn: koboToMajor(r.paidKobo),
      otherIncome: koboToMajor(r.otherIncomeKobo),
      expenses: koboToMajor(r.expensesKobo),
      profit: koboToMajor(r.profitKobo),
    }));

  const catMonths = monthRange(addMonths(month, -2), month);
  const cats = categoryTotals(data, catMonths);
  const catSum = cats.reduce((s, c) => s + c.kobo, 0);
  const expensesByCategory = cats.map((c) => ({
    category: c.category,
    amount: koboToMajor(c.kobo),
    sharePct: catSum > 0 ? Math.round((c.kobo / catSum) * 1000) / 10 : 0,
  }));

  const budgets = budgetStatus(data, month).map((b) => ({
    category: b.category,
    cap: koboToMajor(b.capKobo),
    spent: koboToMajor(b.spentKobo),
    usedPct: Math.round(b.ratio * 1000) / 10,
    over: b.over,
  }));

  const topClientsOutstanding = clientSummaries(data, today)
    .filter((c) => c.billedKobo > 0)
    .slice(0, MAX_CLIENTS)
    .map((c) => ({
      name: c.name,
      billed: koboToMajor(c.billedKobo),
      paid: koboToMajor(c.paidKobo),
      outstanding: koboToMajor(c.outstandingKobo),
      overdueInvoices: c.overdueCount,
    }));

  const clientName = new Map(data.clients.map((c) => [c.id, c.name]));
  const outstandingInvoices = data.invoices
    .filter((i) => i.status === "unpaid")
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
    .slice(0, MAX_OUTSTANDING)
    .map((i) => ({
      number: i.number,
      client: clientName.get(i.clientId) ?? "Unknown client",
      amount: koboToMajor(invoiceTotalKobo(i)),
      due: i.dueDate,
      daysPastDue: daysPastDue(i.dueDate, today),
    }));

  const recurringItems = [
    ...data.expenses.filter((e) => e.recurring).map((e) => ({ kind: "expense" as const, description: e.description, amount: koboToMajor(e.amountKobo) })),
    ...data.incomes.filter((n) => n.recurring).map((n) => ({ kind: "income" as const, description: n.description, amount: koboToMajor(n.amountKobo) })),
  ];
  const monthlyExpenses = data.expenses.filter((e) => e.recurring).reduce((s, e) => s + e.amountKobo, 0);
  const monthlyIncome = data.incomes.filter((n) => n.recurring).reduce((s, n) => s + n.amountKobo, 0);

  return {
    asOf: today,
    currency: "NGN",
    thisMonth: {
      month,
      invoiced: koboToMajor(totals.invoicedKobo),
      paidIn: koboToMajor(totals.paidKobo),
      otherIncome: koboToMajor(totals.otherIncomeKobo),
      expenses: koboToMajor(totals.expensesKobo),
      profitCash: koboToMajor(totals.profitKobo),
      outstanding: koboToMajor(totals.outstandingKobo),
    },
    byMonth,
    expensesByCategory,
    budgets,
    topClientsOutstanding,
    outstandingInvoices,
    recurring: { monthlyExpenses: koboToMajor(monthlyExpenses), monthlyIncome: koboToMajor(monthlyIncome), items: recurringItems.slice(0, 20) },
    counts: { clients: data.clients.length, invoices: data.invoices.length, expenses: data.expenses.length, incomes: data.incomes.length },
  };
}

/** Months the summary covers, used by tests and the UI for labels. */
export function summaryMonths(today: string): string[] {
  return monthRange(addMonths(monthKey(today), -(MAX_MONTHS - 1)), monthKey(today));
}

/** System prompt with the summary embedded as JSON. The API key never appears here. */
export function buildSystemPrompt(summary: FinanceSummary): string {
  return [
    "You are \"Ask my books\", a finance assistant inside the MercuReal Invoice app for a Nigerian freelancer.",
    "Answer ONLY from the JSON summary below. Amounts are in naira (NGN) as plain numbers; write them as ₦ with commas.",
    "The summary is the freelancer's own data. Never invent invoices, clients, payments or amounts. If the answer is not in the data, say what is missing.",
    "Be direct and specific: name the category, month or client, give the figure, then one practical suggestion. Use short paragraphs or a short list. No markdown tables.",
    "Profit here is cash basis: payments received plus other income minus expenses for the month.",
    "",
    "FINANCE SUMMARY (JSON):",
    JSON.stringify(summary),
  ].join("\n");
}

/** Starter questions shown above the chat input. */
export const STARTER_QUESTIONS = [
  "Where does my money go?",
  "Am I profitable this month?",
  "Which client owes me most?",
  "Which expenses are over budget?",
  "What should I chase this week?",
];
