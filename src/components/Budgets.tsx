import { budgetStatus } from "../lib/budgets";
import { formatMonth } from "../lib/dates";
import { formatNaira, parseNairaToKobo } from "../lib/money";
import { EXPENSE_CATEGORIES, type AppData, type ExpenseCategory } from "../lib/types";
import { Badge, card, inputClass, ProgressBar } from "./ui";

/** Monthly caps per category with progress bars. Setting a blank cap removes it. */
export function BudgetPanel({ data, month, update }: { data: AppData; month: string; update: (fn: (d: AppData) => AppData) => void }) {
  const rows = budgetStatus(data, month);
  const capOf = (c: ExpenseCategory) => (data.budgets[c] ? (data.budgets[c]! / 100).toString() : "");

  function setCap(c: ExpenseCategory, raw: string) {
    const kobo = raw.trim() === "" ? null : parseNairaToKobo(raw);
    if (raw.trim() !== "" && (kobo === null || kobo <= 0)) return;
    update((d) => {
      const budgets = { ...d.budgets };
      if (kobo === null) delete budgets[c];
      else budgets[c] = kobo;
      return { ...d, budgets };
    });
  }

  return (
    <div className={card + " space-y-4"}>
      <div>
        <div className="font-semibold">Budget caps · {formatMonth(month)}</div>
        <p className="text-sm text-stone-500 dark:text-stone-400">Set a monthly cap per category. Recurring expenses count every month.</p>
      </div>
      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.category} className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">{r.category}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  {formatNaira(r.spentKobo)} / {formatNaira(r.capKobo)}
                  {r.over ? <Badge tone="bad">over by {formatNaira(r.spentKobo - r.capKobo)}</Badge> : <Badge tone={r.ratio >= 0.8 ? "warn" : "good"}>{Math.round(r.ratio * 100)}%</Badge>}
                </span>
              </div>
              <ProgressBar ratio={r.ratio} label={`${r.category} budget`} />
            </div>
          ))}
        </div>
      )}
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-emerald-700 dark:text-emerald-400">Edit caps</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {EXPENSE_CATEGORIES.map((c) => (
            <label key={c} className="block min-w-0">
              <span className="mb-1 block text-sm text-stone-600 dark:text-stone-300">{c} (₦ per month)</span>
              <input key={c + capOf(c)} inputMode="decimal" className={inputClass} defaultValue={capOf(c)} placeholder="No cap" onBlur={(e) => setCap(c, e.target.value)} />
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
