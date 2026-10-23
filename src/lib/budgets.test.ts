import { describe, expect, it } from "vitest";
import { budgetStatus } from "./budgets";
import { emptyData } from "./storage";
import { clientStatement, clientSummaries, daysPastDue, overdueInvoices } from "./statement";
import { reminderText } from "./reminders";
import { categoryTotals, monthRows, monthlySummary, occurrencesIn, dashboardTotals } from "./summary";
import { monthRange, addMonths, daysBetween } from "./dates";
import { setDisplayFormat, formatNaira } from "./money";
import type { AppData, Invoice } from "./types";

const inv = (over: Partial<Invoice>): Invoice => ({
  id: "i", number: "INV-2026-001", clientId: "c1", issueDate: "2026-10-05", dueDate: "2026-10-20",
  items: [{ id: "l", description: "", quantity: 1, unitPriceKobo: 100000 }], withVat: false, status: "unpaid", notes: "", ...over,
});

const base: AppData = {
  ...emptyData(),
  clients: [{ id: "c1", name: "Acme", email: "", address: "" }, { id: "c2", name: "Bola", email: "", address: "" }],
  invoices: [
    inv({ id: "a", clientId: "c1", items: [{ id: "x", description: "", quantity: 1, unitPriceKobo: 100000 }] }),
    inv({ id: "b", clientId: "c2", number: "INV-2026-002", status: "paid", paidDate: "2026-10-12", items: [{ id: "y", description: "", quantity: 1, unitPriceKobo: 50000 }] }),
    inv({ id: "c", clientId: "c1", number: "INV-2026-003", dueDate: "2026-11-30", items: [{ id: "z", description: "", quantity: 1, unitPriceKobo: 25000 }] }),
  ],
  expenses: [
    { id: "e1", date: "2026-10-03", description: "data", category: "Data & airtime", amountKobo: 15000 },
    { id: "e2", date: "2026-08-01", description: "Figma", category: "Software & subscriptions", amountKobo: 7000, recurring: true },
  ],
  incomes: [{ id: "n", date: "2026-09-01", description: "retainer", amountKobo: 40000, recurring: true }],
  budgets: { "Data & airtime": 10000, Transport: 5000 },
};

describe("recurring flags", () => {
  it("counts recurring entries in every month from their start", () => {
    expect(occurrencesIn({ date: "2026-08-01", recurring: true }, ["2026-07", "2026-08", "2026-10"])).toBe(2);
    expect(occurrencesIn({ date: "2026-08-01" }, ["2026-08", "2026-09"])).toBe(1);
  });
  it("adds recurring income and expenses to the dashboard profit", () => {
    const t = dashboardTotals(base, "2026-10-23");
    expect(t.expensesKobo).toBe(15000 + 7000);
    expect(t.otherIncomeKobo).toBe(40000);
    expect(t.profitKobo).toBe(50000 + 40000 - 22000);
  });
  it("rolls recurring items into each monthly row", () => {
    const rows = monthRows(base, ["2026-08", "2026-09", "2026-10"]);
    expect(rows.map((r) => r.expensesKobo)).toEqual([7000, 7000, 22000]);
    expect(rows.map((r) => r.otherIncomeKobo)).toEqual([0, 40000, 40000]);
  });
  it("totals categories with recurrence", () => {
    const cats = categoryTotals(base, ["2026-08", "2026-09", "2026-10"]);
    expect(cats.find((c) => c.category === "Software & subscriptions")?.kobo).toBe(21000);
  });
  it("builds a monthly summary spanning the logged range", () => {
    const months = monthlySummary(base, "2026-10-23").map((r) => r.month);
    expect(months).toEqual(["2026-10", "2026-09", "2026-08"]);
  });
});

describe("budgetStatus", () => {
  it("reports progress only for categories with a cap", () => {
    const rows = budgetStatus(base, "2026-10");
    expect(rows).toEqual([
      { category: "Data & airtime", capKobo: 10000, spentKobo: 15000, ratio: 1.5, over: true },
      { category: "Transport", capKobo: 5000, spentKobo: 0, ratio: 0, over: false },
    ]);
  });
  it("includes recurring spend in the month's progress", () => {
    const rows = budgetStatus({ ...base, budgets: { "Software & subscriptions": 5000 } }, "2026-10");
    expect(rows[0]).toMatchObject({ spentKobo: 7000, over: true });
  });
  it("is empty without budgets", () => {
    expect(budgetStatus({ ...base, budgets: {} }, "2026-10")).toEqual([]);
  });
});

describe("client statement", () => {
  it("lists every invoice for the client with paid and outstanding totals", () => {
    const s = clientStatement(base, "c1", "2026-10-23");
    expect(s?.rows.map((r) => r.number)).toEqual(["INV-2026-001", "INV-2026-003"]);
    expect(s?.billedKobo).toBe(125000);
    expect(s?.paidKobo).toBe(0);
    expect(s?.outstandingKobo).toBe(125000);
    expect(s?.overdueKobo).toBe(100000);
  });
  it("returns null for an unknown client", () => {
    expect(clientStatement(base, "nope", "2026-10-23")).toBeNull();
  });
  it("ranks client summaries by outstanding", () => {
    const list = clientSummaries(base, "2026-10-23");
    expect(list[0].name).toBe("Acme");
    expect(list[1]).toMatchObject({ name: "Bola", outstandingKobo: 0, paidKobo: 50000 });
  });
});

describe("overdue and reminders", () => {
  it("lists only unpaid past-due invoices, oldest due first", () => {
    expect(overdueInvoices(base, "2026-10-23").map((i) => i.id)).toEqual(["a"]);
    expect(overdueInvoices(base, "2026-12-01").map((i) => i.id)).toEqual(["a", "c"]);
  });
  it("computes days past due", () => {
    expect(daysPastDue("2026-10-20", "2026-10-23")).toBe(3);
    expect(daysBetween("2026-10-23", "2026-10-20")).toBe(-3);
  });
  it("writes a reminder with the amount and days late", () => {
    const text = reminderText(base.invoices[0], base.clients[0], "2026-10-23");
    expect(text).toContain("INV-2026-001");
    expect(text).toContain("₦1,000.00");
    expect(text).toContain("3 days past due");
  });
});

describe("dates and formatting", () => {
  it("builds month ranges across a year boundary", () => {
    expect(monthRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
  it("switches between kobo-precise and whole-naira display", () => {
    setDisplayFormat({ wholeUnits: false, symbol: "₦" });
    expect(formatNaira(125050)).toBe("₦1,250.50");
    setDisplayFormat({ wholeUnits: true, symbol: "NGN " });
    expect(formatNaira(125050)).toBe("NGN 1,251");
    setDisplayFormat({ wholeUnits: false, symbol: "₦" });
  });
});
