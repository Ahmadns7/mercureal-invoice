import { describe, expect, it } from "vitest";
import { qrPayload } from "./qr";
import type { Invoice } from "./types";

const base: Invoice = {
  id: "inv1",
  number: "INV-0007",
  clientId: "c1",
  issueDate: "2026-10-01",
  dueDate: "2026-10-31",
  items: [{ id: "l1", description: "Design", quantity: 2, unitPriceKobo: 10000000 }],
  withVat: false,
  status: "unpaid",
  notes: "",
};

describe("qrPayload", () => {
  it("encodes the payment link when set", () => {
    expect(qrPayload({ ...base, paymentLink: "https://paystack.com/pay/abc" })).toBe("https://paystack.com/pay/abc");
  });
  it("falls back to a compact summary without a link", () => {
    const p = qrPayload(base);
    expect(p).toContain("Invoice INV-0007");
    expect(p).toContain("ID: inv1");
    expect(p).toContain("Total: ");
    expect(p).toContain("Due: ");
    expect(p.split("\n").length).toBe(4);
  });
  it("ignores a non-https link and uses the summary", () => {
    expect(qrPayload({ ...base, paymentLink: "http://insecure.example" })).toMatch(/^Invoice INV-0007/);
  });
  it("includes VAT in the total when enabled", () => {
    const withVat = qrPayload({ ...base, withVat: true });
    const noVat = qrPayload(base);
    expect(withVat).not.toBe(noVat);
  });
});
