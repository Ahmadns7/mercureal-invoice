import type { Invoice } from "./types";
import { invoiceTotals } from "./money";
import { formatMoney } from "./fx";
import { invoiceCurrency } from "./fx";
import { formatDate } from "./dates";

/**
 * Payload encoded in the invoice QR code. A payment link wins when it is set (https only).
 * Otherwise a compact plain-text summary so a phone scan still shows what is owed.
 */
export function qrPayload(invoice: Invoice): string {
  if (invoice.paymentLink && /^https:\/\//i.test(invoice.paymentLink)) return invoice.paymentLink;
  const cur = invoiceCurrency(invoice);
  const { totalKobo } = invoiceTotals(invoice.items, invoice.withVat);
  const lines = [
    `Invoice ${invoice.number}`,
    `ID: ${invoice.id}`,
    `Total: ${formatMoney(totalKobo, cur)}`,
    `Due: ${formatDate(invoice.dueDate)}`,
  ];
  return lines.join("\n");
}
