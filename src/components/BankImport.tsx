import { useState } from "react";
import type { AppData, ExpenseCategory } from "../lib/types";
import { EXPENSE_CATEGORIES } from "../lib/types";
import { type BankRow, prefillRows, learnKeyword, upsertMapping } from "../lib/bankImport";
import { newId } from "../lib/ids";
import { parseStatementFile } from "../lib/statementFile";

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  today: string;
}

/** Persist a bank's narration-to-category mapping, keyed by bank name. */
function bankName(file: File): string {
  return file.name.replace(/\.(csv|xlsx|xls|docx|doc|pdf)$/i, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase() || "statement";
}

export function BankImportPanel({ data, update }: Props) {
  const [rows, setRows] = useState<BankRow[] | null>(null);
  const [bank, setBank] = useState("");
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState(0);

  async function onFile(file: File) {
    setError("");
    setSkipped(0);
    let parsed;
    try {
      parsed = await parseStatementFile(file);
    } catch (e) {
      setRows(null);
      return setError(e instanceof Error ? e.message : "Could not read this file.");
    }
    if (!parsed) {
      setRows(null);
      return setError("Could not find date, narration and amount columns in this file. Check it is a bank statement export (CSV, Excel, Word or a text PDF).");
    }
    const name = bankName(file);
    setBank(name);
    setSkipped(parsed.skipped);
    const mapping = data.importMappings?.find((m) => m.bank === name);
    setRows(prefillRows(parsed, mapping?.rules ?? [], newId));
  }

  function updateRow(id: string, patch: Partial<BankRow>) {
    setRows((rs) => rs && rs.map((r) => (r.id === id ? { ...r, ...patch, autoCategory: false } : r)));
  }

  function commit() {
    if (!rows) return;
    const included = rows.filter((r) => r.include);
    const expenses = included.filter((r) => r.direction === "debit").map((r) => ({
      id: newId(),
      date: r.date,
      category: r.category,
      description: r.narration,
      amountKobo: r.amountKobo,
    }));
    const incomes = included.filter((r) => r.direction === "credit").map((r) => ({
      id: newId(),
      date: r.date,
      description: r.narration,
      amountKobo: r.amountKobo,
    }));
    // Learn: each user-chosen category for a debit becomes a keyword rule for this bank.
    const learned = rows.filter((r) => r.direction === "debit" && r.include && !r.autoCategory);
    update((d) => ({
      ...d,
      expenses: [...expenses, ...d.expenses],
      incomes: [...incomes, ...d.incomes],
      importMappings: learned.reduce((m, r) => { const kw = learnKeyword(r.narration); return kw ? upsertMapping(m, bank, { keyword: kw, category: r.category }) : m; }, d.importMappings ?? []),
    }));
    setRows(null);
  }

  return (
    <section className="space-y-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
      <h2 className="text-lg font-semibold">Import bank statement</h2>
      <p className="text-xs text-stone-500">CSV, Excel, Word or text-PDF. Debits become expenses, credits become other income. Repeat imports from the same bank remember your categories.</p>
      <input type="file" accept=".csv,.xlsx,.xls,.docx,.doc,.pdf,text/csv,application/pdf" aria-label="Choose bank CSV" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="text-sm" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows && (
        <>
          <p className="text-sm">{rows.length} rows parsed ({bank}){skipped > 0 && `, ${skipped} skipped`}. Tick the ones to add.</p>
          <ul className="max-h-96 divide-y divide-stone-200 overflow-auto text-sm dark:divide-stone-700">
            {rows.map((r) => (
              <li key={r.id} className="space-y-1 py-2">
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={r.include} onChange={(e) => updateRow(r.id, { include: e.target.checked })} aria-label={`include ${r.narration}`} />
                  <span className="min-w-0 flex-1 break-words">
                    {r.date} · {r.narration} · <strong>{r.direction === "debit" ? "-" : "+"}{(r.amountKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</strong>
                  </span>
                </label>
                {r.direction === "debit" && (
                  <select className="ml-6 rounded border border-stone-300 bg-transparent px-2 py-1 dark:border-stone-600" value={r.category} onChange={(e) => updateRow(r.id, { category: e.target.value as ExpenseCategory })} aria-label={`category for ${r.narration}`}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </li>
            ))}
          </ul>
          <button type="button" onClick={commit} className="rounded-lg bg-stone-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-stone-900">
            Add {rows.filter((r) => r.include).length} entries
          </button>
        </>
      )}
    </section>
  );
}


