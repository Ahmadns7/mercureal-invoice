import { detectColumns, parseBankAmount, parseBankDate, parseBankStatement, type ParsedStatement, type ColumnMap, sniffDelimiter, parseCsvRows } from "./bankImport";

/**
 * Rows of cells from a table-like text (one transaction per line, columns separated by tabs or
 * two+ spaces, or a PDF/DOCX text dump). Used for PDF and Word text extraction.
 */
export function splitTextLines(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, " ").trim())
    .filter((l) => l.length > 0)
    .map((l) => (l.includes("\t") ? l.split("\t") : l.split(/\s{2,}|\|/)).map((c) => c.trim()).filter((c, i, a) => c !== "" || i < a.length - 1));
}

/**
 * Parse a statement whose text has been extracted from a PDF or Word file. First try the table
 * heuristics on the split lines. If no header is found, fall back to date-first lines: a date,
 * a narration, then one or two amounts (debit/credit or a single signed amount).
 */
export function parseStatementText(text: string): ParsedStatement | null {
  const lines = splitTextLines(text);
  const found = detectColumns(lines);
  if (found) {
    return buildFromRows(lines, found.headerIndex, found.columns, "text");
  }
  return parseDateLines(text);
}

/** Excel: the first sheet that has a recognisable header wins. Cells come as strings. */
export function parseSheetRows(sheets: string[][][]): ParsedStatement | null {
  for (const rows of sheets) {
    const clean = rows.map((r) => r.map((c) => String(c ?? "").trim())).filter((r) => r.some((c) => c !== ""));
    const found = detectColumns(clean);
    if (found) return buildFromRows(clean, found.headerIndex, found.columns, "xlsx");
  }
  return null;
}

function buildFromRows(rows: string[][], headerIndex: number, columns: ColumnMap, delimiter: string): ParsedStatement {
  const out: ParsedStatement["rows"] = [];
  let skipped = 0;
  for (const cells of rows.slice(headerIndex + 1)) {
    const parsed = readRowAmount(cells, columns);
    const date = parseBankDate(cells[columns.date] ?? "");
    const narration = (cells[columns.narration] ?? "").replace(/\s+/g, " ").trim();
    if (!date || !parsed) {
      skipped++;
      continue;
    }
    out.push({ date, narration: narration || "(no narration)", amountKobo: parsed.kobo, direction: parsed.direction });
  }
  return { delimiter, headerIndex, columns, rows: out, skipped };
}

function readRowAmount(cells: string[], c: ColumnMap): { kobo: number; direction: "debit" | "credit" } | null {
  const toKobo = (n: number) => Math.round(Math.abs(n) * 100);
  if (c.debit !== undefined || c.credit !== undefined) {
    const d = c.debit !== undefined ? parseBankAmount(cells[c.debit] ?? "") : null;
    const cr = c.credit !== undefined ? parseBankAmount(cells[c.credit] ?? "") : null;
    const dAbs = d === null ? 0 : Math.abs(d);
    const cAbs = cr === null ? 0 : Math.abs(cr);
    if (dAbs > 0 && cAbs === 0) return { kobo: toKobo(dAbs), direction: "debit" };
    if (cAbs > 0 && dAbs === 0) return { kobo: toKobo(cAbs), direction: "credit" };
    if (dAbs > 0 && cAbs > 0) return dAbs >= cAbs ? { kobo: toKobo(dAbs - cAbs), direction: "debit" } : { kobo: toKobo(cAbs - dAbs), direction: "credit" };
    return null;
  }
  if (c.amount === undefined) return null;
  const raw = parseBankAmount(cells[c.amount] ?? "");
  if (raw === null || raw === 0) return null;
  let direction: "debit" | "credit" = raw < 0 ? "debit" : "credit";
  if (c.type !== undefined) {
    const t = (cells[c.type] ?? "").toLowerCase();
    if (/\b(dr|debit|out|withdraw|paid out)\b/.test(t)) direction = "debit";
    else if (/\b(cr|credit|in|deposit|paid in)\b/.test(t)) direction = "credit";
  }
  return { kobo: toKobo(raw), direction };
}

/** Date-first fallback for PDF text with no header row: "23/10/2026 MTN AIRTIME 500.00 1,234.50". */
export function parseDateLines(text: string): ParsedStatement | null {
  const dateRe = /^(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[ -][A-Za-z]{3,9}[ -]\d{2,4})\s+(.+)$/;
  const amountRe = /(\(?-?[\d,]+\.\d{2}\)?(?:\s?(?:Dr|Cr|DR|CR))?)/g;
  const rows: ParsedStatement["rows"] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\u00a0/g, " ").trim();
    if (!line) continue;
    const m = dateRe.exec(line);
    if (!m) continue;
    const date = parseBankDate(m[1]);
    const rest = m[2];
    const amounts = [...rest.matchAll(amountRe)].map((x) => x[1]);
    if (!date || amounts.length === 0) {
      skipped++;
      continue;
    }
    const narration = rest.replace(amountRe, " ").replace(/\s+/g, " ").trim();
    const last = amounts[amounts.length - 1];
    const parsed = parseBankAmount(last);
    if (parsed === null || parsed === 0) {
      skipped++;
      continue;
    }
    let direction: "debit" | "credit" = parsed < 0 ? "debit" : "credit";
    if (/\bdr\b/i.test(last)) direction = "debit";
    if (/\bcr\b/i.test(last)) direction = "credit";
    rows.push({ date, narration: narration || "(no narration)", amountKobo: Math.round(Math.abs(parsed) * 100), direction });
  }
  if (rows.length === 0) return null;
  return { delimiter: "text", headerIndex: -1, columns: { date: 0, narration: 1, amount: 2 }, rows, skipped };
}

/** Re-export so the CSV path and the new paths share one entry point. */
export { parseBankStatement, sniffDelimiter, parseCsvRows };
