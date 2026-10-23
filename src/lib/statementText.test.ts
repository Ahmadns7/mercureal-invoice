import { describe, expect, it } from "vitest";
import { parseStatementText, parseSheetRows, parseDateLines, splitTextLines } from "./statementText";

describe("statement text heuristics", () => {
  it("reads a header table from PDF text split on wide gaps", () => {
    const text = [
      "GTBank statement for account 0123456789",
      "Date          Narration                     Debit        Credit",
      "01/10/2026    MTN AIRTIME 08031234567       500.00",
      "02/10/2026    CLIENT PAYMENT INV-2           ",
      "                                              ",
      "03/10/2026    NETFLIX SUBSCRIPTION         4,500.00",
    ].join("\n");
    const p = parseStatementText(text);
    expect(p).not.toBeNull();
    expect(p!.rows.map((r) => [r.date, r.direction, r.amountKobo])).toEqual([
      ["2026-10-01", "debit", 50000],
      ["2026-10-03", "debit", 450000],
    ]);
  });
  it("falls back to date-first lines when there is no header", () => {
    const text = "23/10/2026 POS PURCHASE SHOPRITE 12,500.00 Dr\n24/10/2026 TRANSFER FROM CLIENT 80,000.00 Cr\nrandom footer";
    const p = parseDateLines(text);
    expect(p).not.toBeNull();
    expect(p!.rows).toHaveLength(2);
    expect(p!.rows[0]).toMatchObject({ date: "2026-10-23", direction: "debit", amountKobo: 1250000 });
    expect(p!.rows[1]).toMatchObject({ date: "2026-10-24", direction: "credit", amountKobo: 8000000 });
  });
  it("returns null for prose with no transactions", () => {
    expect(parseStatementText("This is a letter about your account.\nNo transactions here.")).toBeNull();
  });
  it("splits tab and double-space columns", () => {
    expect(splitTextLines("a\tb\tc")[0]).toEqual(["a", "b", "c"]);
    expect(splitTextLines("Date   Narration   Amount")[0]).toEqual(["Date", "Narration", "Amount"]);
  });
  it("handles excel sheets with a title block and a single signed amount", () => {
    const sheet = [
      ["ACME BANK STATEMENT"],
      ["Txn Date", "Description", "Amount", "Dr/Cr"],
      ["2026-10-05", "UBER TRIP", "-3500", ""],
      ["2026-10-06", "CLIENT TRANSFER", "120000", ""],
    ];
    const p = parseSheetRows([sheet]);
    expect(p).not.toBeNull();
    expect(p!.rows.map((r) => r.direction)).toEqual(["debit", "credit"]);
    expect(p!.rows[0].amountKobo).toBe(350000);
  });
  it("returns null for excel sheets with no header", () => {
    expect(parseSheetRows([[["hello", "world"], ["1", "2"]]])).toBeNull();
  });
});
