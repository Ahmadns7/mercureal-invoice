import { describe, expect, it } from "vitest";
import { parseReceiptJson, manualAmount, validatePaymentLink, isKnownProcessor } from "./receipt";
import { backupDue, daysSinceExport, BACKUP_NAG_DAYS } from "./backup";

describe("receipt parser", () => {
  it("parses a clean JSON reply into fields", () => {
    const r = parseReceiptJson('{"vendor":"MTN","amount_kobo":150000,"date":"2026-10-03","category":"Data & airtime","currency":"NGN"}');
    expect(r).toEqual({ vendor: "MTN", amountKobo: 150000, date: "2026-10-03", category: "Data & airtime", currency: "NGN" });
  });
  it("extracts JSON wrapped in prose or code fences", () => {
    const r = parseReceiptJson('Here it is:\n```json\n{"vendor":"Uber","amount_kobo":0,"date":null,"category":"Transport","currency":"USD"}\n```');
    expect(r?.vendor).toBe("Uber");
    expect(r?.amountKobo).toBeNull();
    expect(r?.currency).toBe("USD");
  });
  it("falls back to Other and NGN for unknown category or currency", () => {
    const r = parseReceiptJson('{"vendor":"X","amount_kobo":500,"date":"2026-1-3","category":"Groceries","currency":"JPY"}');
    expect(r?.category).toBe("Other");
    expect(r?.currency).toBe("NGN");
    expect(r?.date).toBeNull();
  });
  it("returns null for prose or broken JSON", () => {
    expect(parseReceiptJson("I cannot read this image")).toBeNull();
    expect(parseReceiptJson('{"vendor": "broken"')).toBeNull();
  });
});

describe("manual receipt amount and payment link", () => {
  it("manual entry parses naira text to kobo", () => {
    expect(manualAmount("1,250.50")).toBe(125050);
  });
  it("accepts https links and clears on empty", () => {
    expect(validatePaymentLink("")).toEqual({ ok: true, value: "" });
    expect(validatePaymentLink("https://paystack.com/pay/abc").ok).toBe(true);
    expect(validatePaymentLink("http://paystack.com/pay/abc").ok).toBe(false);
    expect(validatePaymentLink("not a link").ok).toBe(false);
  });
  it("recognises paystack and flutterwave hosts", () => {
    expect(isKnownProcessor("https://paystack.com/pay/abc")).toBe(true);
    expect(isKnownProcessor("https://checkout.flutterwave.com/v3/hosted/pay/x")).toBe(true);
    expect(isKnownProcessor("https://example.com/pay")).toBe(false);
  });
});

describe("backup reminder", () => {
  const DAY = 86400000;
  const now = Date.parse("2026-10-23T12:00:00Z");
  it("shows nothing when there is no data", () => {
    expect(backupDue(null, now, false)).toBe(false);
  });
  it("shows when data exists and never exported", () => {
    expect(backupDue(null, now, true)).toBe(true);
    expect(daysSinceExport(null, now)).toBeNull();
  });
  it("hides within 30 days and shows at 30 days", () => {
    const recent = new Date(now - 29 * DAY).toISOString();
    const old = new Date(now - BACKUP_NAG_DAYS * DAY).toISOString();
    expect(backupDue(recent, now, true)).toBe(false);
    expect(backupDue(old, now, true)).toBe(true);
    expect(daysSinceExport(old, now)).toBe(30);
  });
});
