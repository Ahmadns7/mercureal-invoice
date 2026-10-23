import { formatDate, daysBetween } from "./dates";
import { formatNaira } from "./money";
import { invoiceTotalKobo } from "./summary";
import type { Client, Invoice } from "./types";

/** Plain-text payment reminder the user can paste into WhatsApp or email. */
export function reminderText(inv: Invoice, client: Client | undefined, today: string): string {
  const name = client?.name?.trim() || "there";
  const late = daysBetween(inv.dueDate, today);
  const lateNote = late > 0 ? `, which is now ${late} day${late === 1 ? "" : "s"} past due` : "";
  return `Hi ${name}, a friendly reminder that invoice ${inv.number} for ${formatNaira(invoiceTotalKobo(inv))} was due on ${formatDate(inv.dueDate)}${lateNote}. Please let me know when payment is on its way. Thank you.`;
}
