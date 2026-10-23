import { describe, expect, it } from "vitest";
import { buildFinanceSummary, buildSystemPrompt, summaryMonths, STARTER_QUESTIONS } from "./context";
import { emptyData } from "../storage";
import type { AppData, Invoice, Expense } from "../types";

const TODAY = "2026-10-23";
const client = (id: string, name: string) => ({ id, name, email: `${id}@x.ng`, address: "" });
const inv = (over: Partial<Invoice>): Invoice => ({
  id: "i", number: "INV-2026-001", clientId: "c1", issueDate: "2026-10-05", dueDate: "2026-10-20",
  items: [{ id: "l", description: "design", quantity: 1, unitPriceKobo: 100000 }], withVat: false,
  status: "unpaid", notes: "", ...over,
});
const exp = (over: Partial<Expense>): Expense => ({ id: "e", date: "2026-10-03", description: "data", category: "Data & airtime", amountKobo: 30000, ...over });

const data: AppData = {
  ...emptyData(),
  clients: [client("c1", "Acme Ltd"), client("c2", "Bola Media")],
  invoices: [
    inv({ id: "a", number: "INV-2026-001", clientId: "c1", issueDate: "2026-10-05", dueDate: "2026-10-20", items: [{ id: "x", description: "", quantity: 1, unitPriceKobo: 100000 }] }),
    inv({ id: "b", number: "INV-2026-002", clientId: "c2", issueDate: "2026-10-10", dueDate: "2026-10-30", status: "paid", paidDate: "2026-10-12", paymentMethod: "bank_transfer", items: [{ id: "y", description: "", quantity: 2, unitPriceKobo: 100000 }] }),
  ],
  expenses: [
    exp({ id: "e1", date: "2026-10-03", amountKobo: 30000 }),
    exp({ id: "e2", date: "2026-09-30", category: "Software & subscriptions", amountKobo: 99999, recurring: true, description: "Figma" }),
  ],
  incomes: [{ id: "n1", date: "2026-10-01", description: "retainer", amountKobo: 500000, recurring: true }],
  budgets: { "Data & airtime": 20000 },
};

describe("buildFinanceSummary", () => {
  const s = buildFinanceSummary(data, TODAY);

  it("reports this month in naira major units", () => {
    expect(s.thisMonth.month).toBe("2026-10");
    expect(s.thisMonth.invoiced).toBe(3000);
    expect(s.thisMonth.paidIn).toBe(2000);
    expect(s.thisMonth.otherIncome).toBe(5000);
    expect(s.thisMonth.expenses).toBe(300 + 999.99);
    expect(s.thisMonth.profitCash).toBe(2000 + 5000 - 300 - 999.99);
    expect(s.thisMonth.outstanding).toBe(1000);
  });

  it("includes recurring entries in the current month", () => {
    expect(s.thisMonth.expenses).toBeCloseTo(1299.99);
    expect(s.recurring.monthlyExpenses).toBe(999.99);
    expect(s.recurring.monthlyIncome).toBe(5000);
  });

  it("lists category shares and budget progress", () => {
    const total = s.expensesByCategory.reduce((a, c) => a + c.sharePct, 0);
    expect(Math.round(total)).toBe(100);
    expect(s.budgets).toEqual([{ category: "Data & airtime", cap: 200, spent: 300, usedPct: 150, over: true }]);
  });

  it("ranks clients by outstanding and lists unpaid invoices with days past due", () => {
    expect(s.topClientsOutstanding[0]).toMatchObject({ name: "Acme Ltd", outstanding: 1000, overdueInvoices: 1 });
    expect(s.outstandingInvoices).toEqual([
      { number: "INV-2026-001", client: "Acme Ltd", amount: 1000, due: "2026-10-20", daysPastDue: 3 },
    ]);
  });

  it("covers at most 12 months, oldest first", () => {
    expect(s.byMonth.length).toBeLessThanOrEqual(12);
    expect(s.byMonth.map((m) => m.month)).toEqual([...s.byMonth.map((m) => m.month)].sort());
    expect(summaryMonths(TODAY)).toHaveLength(12);
  });

  it("never contains storage keys, the api key or raw ids", () => {
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/mercureal-invoice:|apiKey|gsk_|sk-/);
    expect(json).not.toContain('"clientId"');
  });

  it("handles empty books", () => {
    const e = buildFinanceSummary(emptyData(), TODAY);
    expect(e.thisMonth.profitCash).toBe(0);
    expect(e.byMonth).toEqual([]);
    expect(e.outstandingInvoices).toEqual([]);
  });
});

describe("buildSystemPrompt", () => {
  it("embeds the summary JSON and forbids inventing data", () => {
    const s = buildFinanceSummary(data, TODAY);
    const prompt = buildSystemPrompt(s);
    expect(prompt).toContain("FINANCE SUMMARY (JSON):");
    expect(prompt).toContain(JSON.stringify(s));
    expect(prompt).toMatch(/Never invent/);
  });
  it("ships starter questions", () => {
    expect(STARTER_QUESTIONS).toContain("Where does my money go?");
    expect(STARTER_QUESTIONS).toContain("Am I profitable this month?");
    expect(STARTER_QUESTIONS).toContain("Which client owes me most?");
  });
});
