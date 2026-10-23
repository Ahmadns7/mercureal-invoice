import { useMemo, useState } from "react";
import type { AppData } from "../lib/types";
import { formatMoney } from "../lib/fx";
import { formatNaira } from "../lib/money";
import { quarterOf, vatByQuarter } from "../lib/recurring";

/**
 * Quarterly VAT. Shows output VAT per calendar quarter, with invoice-level drill-down.
 * Only invoices with withVat=true contribute VAT. Foreign currency VAT is converted at the saved FX rates.
 */
export function TaxPanel({ data, today }: { data: AppData; today: string }) {
  const quarters = useMemo(() => vatByQuarter(data.invoices, data.fxRates), [data]);
  const currentQ = quarterOf(today);
  const [open, setOpen] = useState<string | null>(currentQ);
  const selected = quarters.find((q) => q.quarter === open);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Tax helper</h1>
        <button type="button" onClick={() => window.print()} className="no-print rounded-lg bg-stone-900 px-3 py-1.5 text-sm text-white dark:bg-white dark:text-stone-900">
          Print / save PDF
        </button>
      </div>
      <p className="text-sm text-stone-500">VAT is 7.5% on invoices marked VAT. Naira equivalents use your saved FX rates. Consult your accountant before filing.</p>

      {quarters.length === 0 && <p className="text-sm text-stone-500">No invoices yet. VAT quarters appear once you have invoices.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {quarters.map((q) => (
          <button
            key={q.quarter}
            type="button"
            onClick={() => setOpen(q.quarter)}
            className={`rounded-xl border p-3 text-left ${open === q.quarter ? "border-stone-900 dark:border-white" : "border-stone-200 dark:border-stone-700"}`}
          >
            <div className="text-sm font-medium">{q.label}{q.quarter === currentQ ? " (this quarter)" : ""}</div>
            <div className="mt-1 text-lg font-semibold">{formatNaira(q.vatNgnKobo)} VAT owed</div>
            <div className="text-xs text-stone-500">{q.invoiceCount} VAT invoice{q.invoiceCount === 1 ? "" : "s"} · taxable {formatNaira(q.taxableNgnKobo)}</div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="rounded-xl border border-stone-200 p-3 dark:border-stone-700">
          <h2 className="font-medium">What you owe for {selected.label}</h2>
          <p className="text-sm">VAT owed: <strong>{formatNaira(selected.vatNgnKobo)}</strong> on taxable value {formatNaira(selected.taxableNgnKobo)}.</p>
          <ul className="mt-2 divide-y divide-stone-200 text-sm dark:divide-stone-700">
            {selected.lines.length === 0 && <li className="py-2 text-stone-500">No VAT invoices in this quarter.</li>}
            {selected.lines.map((l) => (
              <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{l.number} · {l.issueDate} · {l.paid ? "paid" : "unpaid"}</span>
                <span>
                  VAT {formatMoney(l.vatMinor, l.currency)} {l.currency !== "NGN" && <span className="text-stone-500">({formatNaira(l.vatNgnKobo)})</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

