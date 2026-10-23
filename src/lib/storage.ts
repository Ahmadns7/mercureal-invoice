import type { AppData } from "./types";
import { PAYMENT_METHODS, EXPENSE_CATEGORIES } from "./types";
import { isValidISODate } from "./dates";

export const STORAGE_KEY = "mercureal-invoice:v1";

export function emptyData(): AppData {
  return { version: 1, clients: [], invoices: [], expenses: [] };
}

export function loadData(storage: Storage = localStorage): AppData {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const parsed = parseImport(raw);
    return parsed ?? emptyData();
  } catch {
    return emptyData();
  }
}

export function saveData(data: AppData, storage: Storage = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function exportJSON(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

/** Validate an import payload. Returns null when the shape is invalid. */
export function parseImport(text: string): AppData | null {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const d = obj as Record<string, unknown>;
  if (d.version !== 1) return null;
  if (!Array.isArray(d.clients) || !Array.isArray(d.invoices) || !Array.isArray(d.expenses)) {
    return null;
  }
  for (const i of d.invoices as Record<string, unknown>[]) {
    if (typeof i.id !== "string" || typeof i.number !== "string") return null;
    if (typeof i.issueDate !== "string" || !isValidISODate(i.issueDate)) return null;
    if (typeof i.dueDate !== "string" || !isValidISODate(i.dueDate)) return null;
    if (i.status !== "paid" && i.status !== "unpaid") return null;
    if (i.paymentMethod !== undefined && !(PAYMENT_METHODS as readonly unknown[]).includes(i.paymentMethod)) return null;
    if (!Array.isArray(i.items)) return null;
  }
  for (const e of d.expenses as Record<string, unknown>[]) {
    if (typeof e.id !== "string" || typeof e.date !== "string" || !isValidISODate(e.date)) return null;
    if (typeof e.amountKobo !== "number" || !Number.isInteger(e.amountKobo) || e.amountKobo < 0) return null;
    if (!(EXPENSE_CATEGORIES as readonly unknown[]).includes(e.category)) return null;
  }
  return obj as AppData;
}
