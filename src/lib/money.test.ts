import { describe, expect, it } from "vitest";
import {
  formatNaira,
  invoiceTotals,
  lineTotalKobo,
  parseNairaToKobo,
  parseQuantity,
  vatKobo,
} from "./money";

describe("parseNairaToKobo", () => {
  it("parses whole and decimal naira", () => {
    expect(parseNairaToKobo("1500")).toBe(150000);
    expect(parseNairaToKobo("1,250.5")).toBe(125050);
    expect(parseNairaToKobo("₦ 99.99")).toBe(9999);
  });
  it("rejects invalid input", () => {
    expect(parseNairaToKobo("")).toBeNull();
    expect(parseNairaToKobo("abc")).toBeNull();
    expect(parseNairaToKobo("1.234")).toBeNull();
    expect(parseNairaToKobo("-5")).toBeNull();
  });
});

describe("formatNaira", () => {
  it("formats kobo as naira with separators", () => {
    expect(formatNaira(0)).toBe("₦0.00");
    expect(formatNaira(125050)).toBe("₦1,250.50");
    expect(formatNaira(100000000)).toBe("₦1,000,000.00");
  });
  it("handles negatives", () => {
    expect(formatNaira(-500)).toBe("-₦5.00");
  });
});

describe("parseQuantity", () => {
  it("accepts positive numbers only", () => {
    expect(parseQuantity("2")).toBe(2);
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("-1")).toBeNull();
    expect(parseQuantity("x")).toBeNull();
  });
});

describe("lineTotalKobo", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineTotalKobo(3, 150000)).toBe(450000);
  });
  it("rounds fractional quantities to the kobo", () => {
    expect(lineTotalKobo(1.5, 101)).toBe(152);
  });
});

describe("vatKobo", () => {
  it("applies 7.5% and rounds", () => {
    expect(vatKobo(100000)).toBe(7500);
    expect(vatKobo(1000)).toBe(75);
    expect(vatKobo(1)).toBe(0);
  });
});

describe("invoiceTotals", () => {
  const lines = [
    { quantity: 2, unitPriceKobo: 500000 },
    { quantity: 1, unitPriceKobo: 250050 },
  ];
  it("totals without VAT", () => {
    expect(invoiceTotals(lines, false)).toEqual({
      subtotalKobo: 1250050,
      vatKobo: 0,
      totalKobo: 1250050,
    });
  });
  it("adds VAT when enabled", () => {
    const t = invoiceTotals(lines, true);
    expect(t.subtotalKobo).toBe(1250050);
    expect(t.vatKobo).toBe(93754);
    expect(t.totalKobo).toBe(1343804);
  });
  it("returns zeros for no lines", () => {
    expect(invoiceTotals([], true)).toEqual({ subtotalKobo: 0, vatKobo: 0, totalKobo: 0 });
  });
});
