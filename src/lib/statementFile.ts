import type { ParsedStatement } from "./bankImport";
import { parseBankStatement } from "./bankImport";
import { parseSheetRows, parseStatementText } from "./statementText";

/**
 * Parse a bank statement file in the browser. Dispatches by extension to CSV, Excel,
 * Word or PDF. Returns null when no transactions were recognised.
 * Throws a plain-language Error for unsupported or unreadable files.
 */
export async function parseStatementFile(file: File): Promise<ParsedStatement | null> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return parseBankStatement(await file.text());
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseExcel(file);
  }
  if (name.endsWith(".docx")) {
    return parseWord(file);
  }
  if (name.endsWith(".doc")) {
    throw new Error("Old .doc Word files are not supported. Save the statement as .docx or export it as CSV.");
  }
  if (name.endsWith(".pdf")) {
    return parsePdf(file);
  }
  throw new Error("Unsupported file type. Use CSV, Excel (.xlsx/.xls), Word (.docx) or a text PDF.");
}

async function parseExcel(file: File): Promise<ParsedStatement | null> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const sheets = wb.SheetNames.map((n) =>
    (XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: "" }) as unknown[][]).map((r) => r.map((c) => String(c ?? ""))),
  );
  return parseSheetRows(sheets);
}

async function parseWord(file: File): Promise<ParsedStatement | null> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return parseStatementText(value);
}

async function parsePdf(file: File): Promise<ParsedStatement | null> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch {
    throw new Error("This PDF could not be opened. It may be password-protected or damaged.");
  }
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Group text items into lines by their vertical position, then join by x order.
    const lines = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as { str?: string; transform?: number[] }[]) {
      if (!item.str || !item.transform) continue;
      const y = Math.round(item.transform[5]);
      const arr = lines.get(y) ?? [];
      arr.push({ x: item.transform[4], s: item.str });
      lines.set(y, arr);
    }
    const ordered = [...lines.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, parts] of ordered) {
      parts.sort((a, b) => a.x - b.x);
      let line = "";
      let lastX = -Infinity;
      for (const p of parts) {
        line += (line && p.x - lastX > 12 ? "   " : line ? " " : "") + p.s;
        lastX = p.x;
      }
      pages.push(line);
    }
  }
  const text = pages.join("\n");
  if (text.replace(/\s/g, "").length < 20) {
    throw new Error("This PDF looks like a scanned image with no text. Scanned PDFs are not supported. Export the statement as CSV or Excel from your bank.");
  }
  return parseStatementText(text);
}
