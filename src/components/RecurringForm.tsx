import { useState } from "react";
import { formatDate, todayISO } from "../lib/dates";
import { formatNaira, parseNairaToKobo } from "../lib/money";
import { newId } from "../lib/ids";
import { EXPENSE_CATEGORIES, type AppData, type Expense, type ExpenseCategory, type OtherIncome } from "../lib/types";
import { btnDanger, btnPrimary, card, EmptyState, Field, inputClass } from "./ui";

/** Expense and other-income entries. Either can be flagged recurring (counts every month from its start date). */
export function EntriesPanel({ data, update }: { data: AppData; update: (fn: (d: AppData) => AppData) => void }) {
  return (
    <section className="space-y-6">
      <ExpenseEntries data={data} update={update} />
      <IncomeEntries data={data} update={update} />
    </section>
  );
}

function ExpenseEntries({ data, update }: { data: AppData; update: (fn: (d: AppData) => AppData) => void }) {
  const [draft, setDraft] = useState({ date: todayISO(), description: "", category: EXPENSE_CATEGORIES[0] as string, amount: "", recurring: false });
  const [error, setError] = useState("");

  function add() {
    const kobo = parseNairaToKobo(draft.amount);
    if (!draft.description.trim()) return setError("Add a description.");
    if (kobo === null || kobo <= 0) return setError("Enter a valid amount in naira.");
    const e: Expense = {
      id: newId(),
      date: draft.date,
      description: draft.description.trim(),
      category: draft.category as ExpenseCategory,
      amountKobo: kobo,
      ...(draft.recurring ? { recurring: true } : {}),
    };
    update((d) => ({ ...d, expenses: [e, ...d.expenses] }));
    setDraft({ ...draft, description: "", amount: "", recurring: false });
    setError("");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Expenses</h1>
      <div className={card + " grid gap-3 sm:grid-cols-2"}>
        <Field label="Date"><input type="date" className={inputClass} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
        <Field label="Amount (₦)"><input inputMode="decimal" className={inputClass} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} /></Field>
        <Field label="Description"><input className={inputClass} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
        <Field label="Category">
          <select className={inputClass} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={draft.recurring} onChange={(e) => setDraft({ ...draft, recurring: e.target.checked })} />
          Recurring every month (from this date)
        </label>
        <div className="sm:col-span-2"><button className={btnPrimary} onClick={add}>Add expense</button></div>
        {error && <div role="alert" className="text-sm text-red-600 sm:col-span-2">{error}</div>}
      </div>
      {data.expenses.length === 0 && <EmptyState text="No expenses logged yet." />}
      {data.expenses.map((e) => (
        <div key={e.id} className={card + " flex items-center justify-between gap-2"}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium"><span className="truncate">{e.description}</span>{e.recurring && <span className="rounded-full bg-sky-500/15 px-2 text-xs text-sky-700 dark:text-sky-300">monthly</span>}</div>
            <div className="text-sm text-stone-500 dark:text-stone-400">{formatDate(e.date)} · {e.category}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="font-semibold tabular-nums">{formatNaira(e.amountKobo)}</span>
            <button className={btnDanger} onClick={() => update((d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== e.id) }))}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function IncomeEntries({ data, update }: { data: AppData; update: (fn: (d: AppData) => AppData) => void }) {
  const [draft, setDraft] = useState({ date: todayISO(), description: "", amount: "", recurring: false });
  const [error, setError] = useState("");

  function add() {
    const kobo = parseNairaToKobo(draft.amount);
    if (!draft.description.trim()) return setError("Add a description.");
    if (kobo === null || kobo <= 0) return setError("Enter a valid amount in naira.");
    const n: OtherIncome = { id: newId(), date: draft.date, description: draft.description.trim(), amountKobo: kobo, ...(draft.recurring ? { recurring: true } : {}) };
    update((d) => ({ ...d, incomes: [n, ...d.incomes] }));
    setDraft({ ...draft, description: "", amount: "", recurring: false });
    setError("");
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Other income</h2>
      <p className="text-sm text-stone-500 dark:text-stone-400">Money that isn't an invoice payment, such as a retainer or grant. Recurring income counts every month.</p>
      <div className={card + " grid gap-3 sm:grid-cols-2"}>
        <Field label="Date"><input type="date" className={inputClass} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
        <Field label="Amount (₦)"><input inputMode="decimal" className={inputClass} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} /></Field>
        <Field label="Description"><input className={inputClass} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={draft.recurring} onChange={(e) => setDraft({ ...draft, recurring: e.target.checked })} />
          Recurring every month
        </label>
        <div className="sm:col-span-2"><button className={btnPrimary} onClick={add}>Add income</button></div>
        {error && <div role="alert" className="text-sm text-red-600 sm:col-span-2">{error}</div>}
      </div>
      {data.incomes.map((n) => (
        <div key={n.id} className={card + " flex items-center justify-between gap-2"}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium"><span className="truncate">{n.description}</span>{n.recurring && <span className="rounded-full bg-sky-500/15 px-2 text-xs text-sky-700 dark:text-sky-300">monthly</span>}</div>
            <div className="text-sm text-stone-500 dark:text-stone-400">{formatDate(n.date)}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{formatNaira(n.amountKobo)}</span>
            <button className={btnDanger} onClick={() => update((d) => ({ ...d, incomes: d.incomes.filter((x) => x.id !== n.id) }))}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
