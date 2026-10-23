import { EXPENSE_CATEGORIES, type ExpenseCategory, type ImportMapping, type ImportRule } from "./types";

export type Direction = "debit" | "credit";

export interface BankRow {
  id: string;
  date: string;
  narration: string;
  /** Always positive, in naira kobo. */
  amountKobo: number;
  direction: Direction;
  /** Category for debits (expenses). Credits are imported as other income. */
  category: ExpenseCategory;
  include: boolean;
  /** True when the category came from a learned mapping or built-in keyword rule. */
  autoCategory: boolean;
}

export interface ParsedStatement {
  delimiter: string;
  headerIndex: number;
  columns: ColumnMap;
  rows: Omit<BankRow, "id" | "category" | "include" | "autoCategory">[];
  skipped: number;
}

export interface ColumnMap {
  date: number;
  narration: number;
  amount?: number;
  debit?: number;
  credit?: number;
  type?: number;
}

/** Split CSV text into rows of cells. Handles quoted cells, embedded commas and newlines, and escaped quotes. */
export function parseCsvRows(text: string, delimiter: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

/** Pick the delimiter that splits the first lines most consistently. Falls back to comma. */
export function sniffDelimiter(text: string): string {
  const sample = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestScore = -1;
  for (const d of candidates) {
    const counts = sample.map((l) => parseCsvRows(l, d)[0]?.length ?? 1);
    const width = counts.length ? Math.max(...counts) : 1;
    if (width < 2) continue;
    const consistent = counts.filter((c) => c === width).length;
    const score = consistent * 10 + width;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Amount text to a signed number. Handles ₦, commas, spaces, parentheses negatives and trailing CR/DR. */
export function parseBankAmount(raw: string): number | null {
  let s = raw.trim();
  if (s === "" || s === "-") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\s*(dr|debit)\s*$/i.test(s)) {
    negative = true;
    s = s.replace(/\s*(dr|debit)\s*$/i, "");
  } else if (/\s*(cr|credit)\s*$/i.test(s)) {
    s = s.replace(/\s*(cr|credit)\s*$/i, "");
  }
  s = s.replace(/[₦NGN$£€,\s]/gi, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}

/** Convert an amount in naira (decimal string or number) to integer kobo. */
export function nairaToKobo(n: number): number {
  return Math.round(n * 100);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse common bank date shapes into YYYY-MM-DD. Nigerian statements are day-first.
 * Accepts 23/10/2026, 23-10-2026, 23/10/26, 2026-10-23, 23-Oct-2026, 23 Oct 2026.
 */
export function parseBankDate(raw: string): string | null {
  const s = raw.trim().split(/\s+/)[0] ?? "";
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(y, Number(m[2]), Number(m[1]));
  }
  const parts = raw.trim().split(/[\s-]+/);
  if (parts.length >= 3) {
    const mon = MONTHS[parts[1].slice(0, 4).toLowerCase().replace(/\.$/, "")] ?? MONTHS[parts[1].slice(0, 3).toLowerCase()];
    const day = Number(parts[0]);
    const year = Number(parts[2]);
    if (mon && Number.isInteger(day) && Number.isInteger(year)) return iso(year < 100 ? 2000 + year : year, mon, day);
  }
  return null;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const DATE_HEADER = /(value|transaction|trans|posted|txn)?\s*date/i;
const NARRATION_HEADER = /narrat|description|details|remark|particular|purpose|payee/i;

/** Locate the header row (exports often have a title block above it) and map the columns. */
export function detectColumns(rows: string[][]): { headerIndex: number; columns: ColumnMap } | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const heads = rows[r].map((h) => h.toLowerCase().trim());
    const find = (re: RegExp) => heads.findIndex((h) => re.test(h));
    const date = heads.findIndex((h) => DATE_HEADER.test(h) && !/value/.test(h));
    const dateCol = date >= 0 ? date : find(DATE_HEADER);
    const narration = find(NARRATION_HEADER);
    const type = find(/^(type|dr\/cr|drcr|flag|direction|cr\/dr|debit\/credit|transaction type)$/);
    const findSide = (re: RegExp) => heads.findIndex((h, i) => i !== type && re.test(h));
    const debit = findSide(/^(debit|withdrawal|dr\b|money out|debit amount|amount debit|paid out)/);
    const credit = findSide(/^(credit|deposit|cr\b|money in|credit amount|amount credit|paid in)/);
    const amount = find(/^(amount|transaction amount|value|txn amount)$/);
    if (dateCol < 0 || narration < 0) continue;
    if (debit < 0 && credit < 0 && amount < 0) continue;
    return {
      headerIndex: r,
      columns: {
        date: dateCol,
        narration,
        ...(amount >= 0 ? { amount } : {}),
        ...(debit >= 0 ? { debit } : {}),
        ...(credit >= 0 ? { credit } : {}),
        ...(type >= 0 ? { type } : {}),
      },
    };
  }
  return null;
}

/**
 * Parse a bank statement CSV into debit/credit rows.
 * Debit/credit detection: separate Debit and Credit columns (nonzero side wins), or one Amount column
 * with a Dr/Cr or Debit/Credit type column, or a single signed Amount (negative = money out).
 * Rows without a valid date or amount are skipped and counted.
 */
export function parseBankStatement(text: string): ParsedStatement | null {
  const delimiter = sniffDelimiter(text);
  const rows = parseCsvRows(text, delimiter);
  const found = detectColumns(rows);
  if (!found) return null;
  const { headerIndex, columns } = found;
  const out: ParsedStatement["rows"] = [];
  let skipped = 0;
  for (const cells of rows.slice(headerIndex + 1)) {
    const date = parseBankDate(cells[columns.date] ?? "");
    const narration = (cells[columns.narration] ?? "").replace(/\s+/g, " ").trim();
    const parsed = readAmount(cells, columns);
    if (!date || !parsed) {
      skipped++;
      continue;
    }
    out.push({ date, narration: narration || "(no narration)", amountKobo: parsed.kobo, direction: parsed.direction });
  }
  return { delimiter, headerIndex, columns, rows: out, skipped };
}

function readAmount(cells: string[], c: ColumnMap): { kobo: number; direction: Direction } | null {
  if (c.debit !== undefined || c.credit !== undefined) {
    const d = c.debit !== undefined ? parseBankAmount(cells[c.debit] ?? "") : null;
    const cr = c.credit !== undefined ? parseBankAmount(cells[c.credit] ?? "") : null;
    const dAbs = d === null ? 0 : Math.abs(d);
    const cAbs = cr === null ? 0 : Math.abs(cr);
    if (dAbs > 0 && cAbs === 0) return { kobo: nairaToKobo(dAbs), direction: "debit" };
    if (cAbs > 0 && dAbs === 0) return { kobo: nairaToKobo(cAbs), direction: "credit" };
    if (dAbs > 0 && cAbs > 0) return dAbs >= cAbs ? { kobo: nairaToKobo(dAbs - cAbs), direction: "debit" } : { kobo: nairaToKobo(cAbs - dAbs), direction: "credit" };
    return null;
  }
  if (c.amount === undefined) return null;
  const raw = parseBankAmount(cells[c.amount] ?? "");
  if (raw === null || raw === 0) return null;
  let direction: Direction = raw < 0 ? "debit" : "credit";
  if (c.type !== undefined) {
    const t = (cells[c.type] ?? "").toLowerCase();
    if (/\b(dr|debit|out|withdraw|paid out)\b/.test(t)) direction = "debit";
    else if (/\b(cr|credit|in|deposit|paid in)\b/.test(t)) direction = "credit";
  }
  return { kobo: nairaToKobo(Math.abs(raw)), direction };
}

/** Built-in keyword rules for common Nigerian narrations. Learned mappings take precedence. */
export const BUILTIN_RULES: ImportRule[] = [
  { keyword: "MTN", category: "Data & airtime" },
  { keyword: "AIRTEL", category: "Data & airtime" },
  { keyword: "GLO", category: "Data & airtime" },
  { keyword: "9MOBILE", category: "Data & airtime" },
  { keyword: "AIRTIME", category: "Data & airtime" },
  { keyword: "DATA BUNDLE", category: "Data & airtime" },
  { keyword: "UBER", category: "Transport" },
  { keyword: "BOLT", category: "Transport" },
  { keyword: "PETROL", category: "Transport" },
  { keyword: "FUEL", category: "Transport" },
  { keyword: "NETFLIX", category: "Software & subscriptions" },
  { keyword: "SPOTIFY", category: "Software & subscriptions" },
  { keyword: "NOTION", category: "Software & subscriptions" },
  { keyword: "GITHUB", category: "Software & subscriptions" },
  { keyword: "OPENAI", category: "Software & subscriptions" },
  { keyword: "ANTHROPIC", category: "Software & subscriptions" },
  { keyword: "GOOGLE", category: "Software & subscriptions" },
  { keyword: "MICROSOFT", category: "Software & subscriptions" },
  { keyword: "SUBSCRIPTION", category: "Software & subscriptions" },
  { keyword: "SERVICE CHARGE", category: "Bank charges" },
  { keyword: "SMS ALERT", category: "Bank charges" },
  { keyword: "MAINTENANCE FEE", category: "Bank charges" },
  { keyword: "VAT ON", category: "Bank charges" },
  { keyword: "STAMP DUTY", category: "Bank charges" },
  { keyword: "META ADS", category: "Marketing" },
  { keyword: "FACEBOOK", category: "Marketing" },
  { keyword: "STATIONERY", category: "Office" },
  { keyword: "ELECTRICITY", category: "Office" },
  { keyword: "LAPTOP", category: "Equipment" },
];

/**
 * Category for a narration. Learned rules (saved from earlier imports of this bank) are tried first,
 * then built-in rules. Matching is whole-word and case-insensitive. Longer keywords win.
 */
export function categorizeNarration(narration: string, learned: ImportRule[] = []): { category: ExpenseCategory; auto: boolean } | null {
  const text = ` ${narration.toUpperCase().replace(/[^A-Z0-9&]+/g, " ")} `;
  const hit = (rules: ImportRule[]) => {
    const sorted = [...rules].sort((a, b) => b.keyword.length - a.keyword.length);
    for (const r of sorted) {
      const k = r.keyword.toUpperCase().trim();
      if (!k) continue;
      if (text.includes(` ${k} `)) return r.category;
    }
    return null;
  };
  const learnedHit = hit(learned);
  if (learnedHit) return { category: learnedHit, auto: true };
  const builtin = hit(BUILTIN_RULES);
  if (builtin) return { category: builtin, auto: true };
  return null;
}

/** Default category when no rule matches. */
export const FALLBACK_CATEGORY: ExpenseCategory = EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

/** The distinctive part of a narration to learn from: the longest token of 4+ letters that is not a stopword. */
const STOP = new Set(["TRANSFER", "FROM", "TO", "PAYMENT", "POS", "ATM", "NIP", "INTERNET", "MOBILE", "ONLINE", "THE", "AND", "REF", "NGN", "BANK", "ACCOUNT", "CHARGE", "CHARGES"]);
export function learnKeyword(narration: string): string | null {
  const tokens = narration.toUpperCase().split(/[^A-Z0-9&]+/).filter((t) => t.length >= 4 && !STOP.has(t) && !/^\d+$/.test(t));
  if (tokens.length === 0) return null;
  return tokens.reduce((a, b) => (b.length > a.length ? b : a));
}

/** Add or update learned rules for a bank. Returns the new mapping list. */
export function upsertMapping(mappings: ImportMapping[] | undefined, bank: string, rule: ImportRule): ImportMapping[] {
  const list = mappings ?? [];
  const existing = list.find((m) => m.bank === bank);
  if (!existing) return [...list, { bank, rules: [rule] }];
  const rules = existing.rules.filter((r) => r.keyword !== rule.keyword).concat(rule);
  return list.map((m) => (m.bank === bank ? { ...m, rules } : m));
}

/** Build BankRow objects with categories pre-filled from learned and built-in rules. */
export function prefillRows(
  parsed: ParsedStatement,
  learned: ImportRule[] = [],
  makeId: () => string,
): BankRow[] {
  return parsed.rows.map((r) => {
    const hit = categorizeNarration(r.narration, learned);
    return {
      ...r,
      id: makeId(),
      category: hit?.category ?? FALLBACK_CATEGORY,
      include: true,
      autoCategory: hit !== null,
    };
  });
}
