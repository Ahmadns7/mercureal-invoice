import { describe, expect, it } from "vitest";
import { nextInvoiceNumber } from "./invoiceNumber";
import { dashboardTotals, monthlySummary } from "./summary";
import { exportJSON, parseImport, emptyData } from "./storage";
import { isOverdue, isValidISODate, monthKey } from "./dates";
import type { AppData, Invoice } from "./types";

const inv = (over: Partial<Invoice>): Invoice => ({
  id: "1",
  number: "INV-2026-001",
  clientId: "c1",
  issueDate: "2026-10-05",
  dueDate: "2026-10-20",
  items: [{ id: "i", description: "design", quantity: 1, unitPriceKobo: 100000 }],
  withVat: false,
  status: "unpaid",
  notes: "",
  ...over,
});

describe("nextInvoiceNumber", () => {
  it("starts at 001 for a new year", () => {
    expect(nextInvoiceNumber([], 2026)).toBe("INV-2026-001");
  });
  it("increments past the highest existing number for that year", () => {
    expect(nextInvoiceNumber(["INV-2026-001", "INV-2026-009", "INV-2025-050"], 2026)).toBe("INV-2026-010");
  });
});

describe("dashboardTotals", () => {
  const data: AppData = {
    ...emptyData(),
    invoices: [
      inv({ id: "a", issueDate: "2026-10-05", items: [{ id: "x", description: "", quantity: 1, unitPriceKobo: 100000 }] }),
      inv({ id: "b", issueDate: "2026-10-10", status: "paid", paidDate: "2026-10-12", paymentMethod: "bank_transfer",
        items: [{ id: "y", description: "", quantity: 1, unitPriceKobo: 200000 }] }),
      inv({ id: "c", issueDate: "2026-09-01", status: "paid", paidDate: "2026-09-03",
        items: [{ id: "z", description: "", quantity: 1, unitPriceKobo: 50000 }] }),
    ],
    expenses: [
      { id: "e1", date: "2026-10-03", description: "data", category: "Data & airtime", amountKobo: 30000 },
      { id: "e2", date: "2026-09-30", description: "old", category: "Other", amountKobo: 99999 },
    ],
  };
  it("computes this month's totals", () => {
    const t = dashboardTotals(data, "2026-10-23");
    expect(t.invoicedKobo).toBe(300000);
    expect(t.paidKobo).toBe(250000);
    expect(t.outstandingKobo).toBe(100000);
    expect(t.expensesKobo).toBe(30000);
    expect(t.profitKobo).toBe(200000 - 30000);
  });
});

describe("monthlySummary", () => {
  it("rolls up invoices, payments and expenses per month, newest first", () => {
    const data: AppData = {
      ...emptyData(),
      invoices: [inv({ status: "paid", paidDate: "2026-11-02", issueDate: "2026-10-05" })],
      expenses: [{ id: "e", date: "2026-10-03", description: "", category: "Office", amountKobo: 500 }],
    };
    const rows = monthlySummary(data);
    expect(rows.map((r) => r.month)).toEqual(["2026-11", "2026-10"]);
    expect(rows[1].invoicedKobo).toBe(100000);
    expect(rows[0].paidKobo).toBe(100000);
    expect(rows[1].expensesKobo).toBe(500);
  });
});

describe("parseImport and export", () => {
  it("round-trips exported data", () => {
    const data: AppData = { ...emptyData(), invoices: [inv({})] };
    expect(parseImport(exportJSON(data))).toEqual(data);
  });
  it("rejects malformed payloads", () => {
    expect(parseImport("not json")).toBeNull();
    expect(parseImport(JSON.stringify({ version: 2, clients: [], invoices: [], expenses: [] }))).toBeNull();
    expect(parseImport(JSON.stringify({ version: 1, clients: [], invoices: [{ id: "x" }], expenses: [] }))).toBeNull();
  });
  it("rejects expenses with fractional kobo", () => {
    const bad = { version: 1, clients: [], invoices: [], expenses: [
      { id: "e", date: "2026-10-01", description: "", category: "Other", amountKobo: 1.5 }] };
    expect(parseImport(JSON.stringify(bad))).toBeNull();
  });
});

describe("date helpers", () => {
  it("validates ISO dates", () => {
    expect(isValidISODate("2026-02-28")).toBe(true);
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("26-02-28")).toBe(false);
  });
  it("derives month keys", () => {
    expect(monthKey("2026-10-23")).toBe("2026-10");
  });
  it("flags overdue unpaid invoices only", () => {
    expect(isOverdue("2026-10-20", "unpaid", "2026-10-23")).toBe(true);
    expect(isOverdue("2026-10-20", "paid", "2026-10-23")).toBe(false);
    expect(isOverdue("2026-10-25", "unpaid", "2026-10-23")).toBe(false);
  });
});
