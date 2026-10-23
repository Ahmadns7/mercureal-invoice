import { describe, expect, it } from "vitest";
import { parseBankStatement, categorizeNarration, prefillRows } from "./bankImport";
import { cloneTemplate, hasGeneratedFor, templatesDue, vatByQuarter, quarterOf } from "./recurring";
import { rateTable, toNairaKobo, formatMoney, DEFAULT_FX } from "./fx";
import type { Invoice } from "./types";

const inv = (over: Partial<Invoice>): Invoice => ({
  id: "a",
  number: "INV-2026-001",
  clientId: "c1",
  issueDate: "2026-10-01",
  dueDate: "2026-10-15",
  items: [{ id: "i", description: "retainer", quantity: 1, unitPriceKobo: 10_000_00 }],
  withVat: true,
  status: "unpaid",
  notes: "",
  ...over,
});

describe("csv bank statement parsing", () => {
  it("parses a GTBank-shaped export with separate debit and credit columns", () => {
    const csv = [
      "Transaction Date,Narration,Debit,Credit,Balance",
      "01/10/2026,POS PURCHASE MTN AIRTIME,\"5,000.00\",,\"95,000.00\"",
      "02/10/2026,SALARY CREDIT ACME,,\"250,000.00\",\"345,000.00\"",
    ].join("\n");
    const p = parseBankStatement(csv);
    expect(p).not.toBeNull();
    expect(p!.rows).toHaveLength(2);
    expect(p!.rows[0]).toMatchObject({ date: "2026-10-01", direction: "debit", amountKobo: 500_000 });
    expect(p!.rows[1]).toMatchObject({ direction: "credit", amountKobo: 25_000_000 });
  });

  it("parses a single signed amount column (negative means debit)", () => {
    const csv = "Date;Description;Amount\n2026-10-03;KUDA TRANSFER TO JOHN;-12000.50\n2026-10-04;INTEREST;35.10";
    const p = parseBankStatement(csv);
    expect(p!.delimiter).toBe(";");
    expect(p!.rows[0]).toMatchObject({ direction: "debit", amountKobo: 1_200_050 });
    expect(p!.rows[1]).toMatchObject({ direction: "credit", amountKobo: 3510 });
  });

  it("uses a Type column when present (DR/CR)", () => {
    const csv = "Value Date,Details,Amount,Type\n05-10-2026,Shop,1000,DR\n06-10-2026,Client pay,2000,CR";
    const p = parseBankStatement(csv);
    expect(p!.rows.map((r) => r.direction)).toEqual(["debit", "credit"]);
  });

  it("skips preamble lines and bad rows, and returns null when no header matches", () => {
    const csv = "GTBank statement\nAccount: 0123\n\nDate,Narration,Debit,Credit\n01/10/2026,FOO,100,\nnot-a-date,BAR,50,";
    const p = parseBankStatement(csv);
    expect(p!.rows).toHaveLength(1);
    expect(p!.skipped).toBe(1);
    expect(parseBankStatement("just,some,words\nno,date,here")).toBeNull();
  });

  it("handles quoted narrations containing commas", () => {
    const csv = 'Date,Narration,Debit\n01/10/2026,"TRANSFER, JOHN DOE, ref 9","1,200"';
    const p = parseBankStatement(csv);
    expect(p!.rows[0].narration).toBe("TRANSFER, JOHN DOE, ref 9");
    expect(p!.rows[0].amountKobo).toBe(120_000);
  });
});

describe("narration categorization", () => {
  it("maps known keywords to categories and falls back to Other", () => {
    expect(categorizeNarration("POS PURCHASE MTN AIRTIME")?.category).toBe("Data & airtime");
    expect(categorizeNarration("UBER TRIP LAGOS")?.category).toBe("Transport");
    expect(categorizeNarration("NETFLIX SUBSCRIPTION")?.category).toBe("Software & subscriptions");
    expect(categorizeNarration("random merchant 77")).toBeNull();
  });

  it("learned rules override built-in keywords on prefill", () => {
    const parsed = parseBankStatement("Date,Narration,Debit\n01/10/2026,MTN AIRTIME,500")!;
    const withRule = prefillRows(parsed, [{ keyword: "mtn", category: "Office" }], () => "x");
    expect(withRule[0].category).toBe("Office");
    expect(withRule[0].autoCategory).toBe(true);
    const plain = prefillRows(parsed, [], () => "y");
    expect(plain[0].category).toBe("Data & airtime");
  });
});

describe("recurring invoice clone", () => {
  it("clones a template with a fresh number, first-of-month issue date, kept terms, unpaid", () => {
    const tpl = inv({ monthlyTemplate: true, status: "paid", paidDate: "2026-10-05", issueDate: "2026-09-01", dueDate: "2026-09-15" });
    const next = cloneTemplate(tpl, [tpl], "2026-11-23", "new-id");
    expect(next.id).toBe("new-id");
    expect(next.number).toBe("INV-2026-002");
    expect(next.issueDate).toBe("2026-11-01");
    expect(next.dueDate).toBe("2026-11-15");
    expect(next.status).toBe("unpaid");
    expect(next.paidDate).toBeUndefined();
    expect(next.monthlyTemplate).toBe(false);
    expect(next.generatedFrom).toBe("a");
  });

  it("reports which templates still need generating this month", () => {
    const t1 = inv({ id: "t1", monthlyTemplate: true });
    const t2 = inv({ id: "t2", number: "INV-2026-002", monthlyTemplate: true });
    const done = inv({ id: "d1", number: "INV-2026-003", issueDate: "2026-10-01", generatedFrom: "t1" });
    expect(hasGeneratedFor([t1, t2, done], "t1", "2026-10")).toBe(true);
    expect(templatesDue([t1, t2, done], "2026-10").map((i) => i.id)).toEqual(["t2"]);
    expect(templatesDue([t1, t2, done], "2026-11").map((i) => i.id)).toEqual(["t1", "t2"]);
  });
});

describe("quarterly VAT grouping", () => {
  it("groups by calendar quarter, only VAT invoices, newest quarter first", () => {
    expect(quarterOf("2026-03-31")).toBe("2026-Q1");
    expect(quarterOf("2026-04-01")).toBe("2026-Q2");
    const list = [
      inv({ id: "q1", issueDate: "2026-02-10", withVat: true }),
      inv({ id: "q1b", issueDate: "2026-03-20", withVat: false }),
      inv({ id: "q4", issueDate: "2026-10-01", withVat: true }),
    ];
    const qs = vatByQuarter(list);
    expect(qs.map((q) => q.quarter)).toEqual(["2026-Q4", "2026-Q1"]);
    expect(qs[0].invoiceCount).toBe(1);
    expect(qs[1].invoiceCount).toBe(1);
    // fixture: 1 x ₦10,000 subtotal at 7.5% VAT = ₦750 = 75,000 kobo
    expect(qs[0].vatNgnKobo).toBe(75_000);
  });
});

describe("fx conversion", () => {
  it("converts minor units to naira kobo using saved rates and defaults", () => {
    expect(rateTable(undefined).USD).toBe(DEFAULT_FX.USD);
    // $100.00 = 10,000 cents at 1,500 naira per dollar = 150,000 naira = 15,000,000 kobo
    expect(toNairaKobo(10_000, "USD", { USD: 1500 })).toBe(15_000_000);
    expect(toNairaKobo(12_345, "NGN", { USD: 1500 })).toBe(12_345);
  });

  it("falls back to defaults for missing or invalid saved rates", () => {
    expect(rateTable({ USD: 0 }).USD).toBe(DEFAULT_FX.USD);
    expect(rateTable({ GBP: Number.NaN }).GBP).toBe(DEFAULT_FX.GBP);
  });

  it("formats foreign minor units with the currency symbol", () => {
    expect(formatMoney(125_050, "USD")).toBe("$1,250.50");
    expect(formatMoney(-500, "GBP")).toBe("-£5.00");
  });
});
