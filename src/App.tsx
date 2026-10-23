import { useState } from "react";
import { InvoiceForm } from "./components/InvoiceForm";
import { InvoiceView } from "./components/InvoiceView";
import { EmptyState, Field, StatCard, btnDanger, btnPrimary, btnSecondary, card, inputClass } from "./components/ui";
import { useAppData } from "./hooks/useAppData";
import { useTheme } from "./hooks/useTheme";
import { formatDate, formatMonth, isOverdue, todayISO, monthKey } from "./lib/dates";
import { formatNaira, parseNairaToKobo } from "./lib/money";
import { paymentMethodLabel } from "./lib/labels";
import { dashboardTotals, invoiceTotalKobo, monthlySummary } from "./lib/summary";
import { exportJSON, parseImport } from "./lib/storage";
import { newId } from "./lib/ids";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type AppData, type Client, type Expense, type Invoice, type PaymentMethod } from "./lib/types";

type Tab = "home" | "invoices" | "clients" | "expenses" | "monthly" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "invoices", label: "Invoices" },
  { id: "clients", label: "Clients" },
  { id: "expenses", label: "Expenses" },
  { id: "monthly", label: "Monthly" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const { data, update, replace } = useAppData();
  const { theme, toggle } = useTheme();
  const [tab, setTab] = useState<Tab>("home");
  const [editing, setEditing] = useState<Invoice | "new" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [importError, setImportError] = useState("");

  const today = todayISO();
  const totals = dashboardTotals(data, today);

  function saveInvoice(inv: Invoice) {
    update((d) => ({ ...d, invoices: d.invoices.some((i) => i.id === inv.id) ? d.invoices.map((i) => (i.id === inv.id ? inv : i)) : [inv, ...d.invoices] }));
    setEditing(null);
  }

  function markPaid(id: string, method: PaymentMethod | null) {
    update((d) => ({
      ...d,
      invoices: d.invoices.map((i) =>
        i.id !== id ? i : method ? { ...i, status: "paid", paidDate: today, paymentMethod: method } : { ...i, status: "unpaid", paidDate: undefined, paymentMethod: undefined },
      ),
    }));
  }

  function download() {
    const blob = new Blob([exportJSON(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mercureal-invoice-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    const parsed = parseImport(await file.text());
    if (!parsed) return setImportError("That file is not a valid MercuReal Invoice export.");
    if (!window.confirm("Importing replaces all current data. Continue?")) return;
    replace(parsed);
    setImportError("");
  }

  const clientName = (id: string) => data.clients.find((c) => c.id === id)?.name ?? "Unknown client";
  const viewingInv = viewing ? data.invoices.find((i) => i.id === viewing) : undefined;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="no-print sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="font-bold text-emerald-700 dark:text-emerald-400">MercuReal Invoice</div>
          <button className={btnSecondary} onClick={toggle} aria-label="Toggle dark mode">{theme === "dark" ? "Light" : "Dark"}</button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 pb-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setEditing(null); setViewing(null); }}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${tab === t.id ? "bg-emerald-600 text-white" : "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 p-4">
        {tab === "home" && (
          <section className="space-y-4">
            <h1 className="text-xl font-semibold">This month, {formatMonth(monthKey(today))}</h1>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <StatCard label="Invoiced" value={formatNaira(totals.invoicedKobo)} />
              <StatCard label="Paid" value={formatNaira(totals.paidKobo)} tone="good" />
              <StatCard label="Outstanding" value={formatNaira(totals.outstandingKobo)} tone={totals.outstandingKobo > 0 ? "bad" : undefined} />
              <StatCard label="Expenses" value={formatNaira(totals.expensesKobo)} />
              <StatCard label="Profit (cash)" value={formatNaira(totals.profitKobo)} tone={totals.profitKobo >= 0 ? "good" : "bad"} />
            </div>
            <p className="text-xs text-stone-500">Profit is payments received this month minus expenses logged this month.</p>
          </section>
        )}

        {tab === "invoices" && !editing && !viewingInv && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold">Invoices</h1>
              <button className={btnPrimary} onClick={() => setEditing("new")} disabled={data.clients.length === 0}>New invoice</button>
            </div>
            {data.invoices.length === 0 && <EmptyState text="No invoices yet. Add a client, then create your first invoice." />}
            {data.invoices.map((inv) => {
              const overdue = isOverdue(inv.dueDate, inv.status, today);
              return (
                <div key={inv.id} className={card}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{inv.number} · {clientName(inv.clientId)}</div>
                      <div className="text-sm text-stone-500">Due {formatDate(inv.dueDate)} · {formatNaira(invoiceTotalKobo(inv))}</div>
                      <div className="text-xs">
                        {inv.status === "paid" ? <span className="text-emerald-700 dark:text-emerald-400">Paid {inv.paidDate ? formatDate(inv.paidDate) : ""} via {paymentMethodLabel(inv.paymentMethod)}</span> : overdue ? <span className="text-red-600">Overdue</span> : <span className="text-stone-500">Unpaid</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className={btnSecondary} onClick={() => setViewing(inv.id)}>View / print</button>
                      <button className={btnSecondary} onClick={() => setEditing(inv)}>Edit</button>
                      {inv.status === "unpaid" ? (
                        <select className={inputClass + " !w-auto"} defaultValue="" onChange={(e) => e.target.value && markPaid(inv.id, e.target.value as PaymentMethod)} aria-label="Mark as paid">
                          <option value="">Mark paid…</option>
                          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{paymentMethodLabel(m)}</option>)}
                        </select>
                      ) : (
                        <button className={btnSecondary} onClick={() => markPaid(inv.id, null)}>Mark unpaid</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {tab === "invoices" && editing && (
          <section className={card}>
            <h2 className="mb-3 font-semibold">{editing === "new" ? "New invoice" : `Edit ${editing.number}`}</h2>
            <InvoiceForm data={data} initial={editing === "new" ? undefined : editing} onSave={saveInvoice} onCancel={() => setEditing(null)} />
          </section>
        )}

        {tab === "invoices" && viewingInv && (
          <section className="space-y-3">
            <div className="no-print flex gap-2">
              <button className={btnSecondary} onClick={() => setViewing(null)}>Back</button>
              <button className={btnPrimary} onClick={() => window.print()}>Print / save PDF</button>
            </div>
            <InvoiceView invoice={viewingInv} data={data} />
          </section>
        )}

        {tab === "clients" && <ClientsPanel data={data} update={update} />}
        {tab === "expenses" && <ExpensesPanel data={data} update={update} />}

        {tab === "monthly" && (
          <section className="space-y-3">
            <h1 className="text-xl font-semibold">Monthly summary</h1>
            {monthlySummary(data).length === 0 && <EmptyState text="Nothing logged yet." />}
            {monthlySummary(data).map((r) => (
              <div key={r.month} className={card}>
                <div className="font-medium">{formatMonth(r.month)}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                  <div>Invoiced<div className="font-semibold">{formatNaira(r.invoicedKobo)}</div></div>
                  <div>Paid<div className="font-semibold">{formatNaira(r.paidKobo)}</div></div>
                  <div>Expenses<div className="font-semibold">{formatNaira(r.expensesKobo)}</div></div>
                  <div>Profit (cash)<div className="font-semibold">{formatNaira(r.paidKobo - r.expensesKobo)}</div></div>
                </div>
              </div>
            ))}
          </section>
        )}

        {tab === "settings" && (
          <section className="space-y-4">
            <h1 className="text-xl font-semibold">Data</h1>
            <div className={card + " space-y-3"}>
              <p className="text-sm text-stone-600 dark:text-stone-300">Your data is stored only in this browser. Export a backup regularly.</p>
              <div className="flex flex-wrap gap-2">
                <button className={btnPrimary} onClick={download}>Export JSON</button>
                <label className={btnSecondary + " cursor-pointer"}>
                  Import JSON
                  <input type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
                </label>
              </div>
              {importError && <div role="alert" className="text-sm text-red-600">{importError}</div>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function ClientsPanel({ data, update }: { data: AppData; update: (fn: (d: AppData) => AppData) => void }) {
  const [draft, setDraft] = useState({ name: "", email: "", address: "" });
  const [error, setError] = useState("");

  function add() {
    if (!draft.name.trim()) return setError("Name is required.");
    const c: Client = { id: newId(), name: draft.name.trim(), email: draft.email.trim(), address: draft.address.trim() };
    update((d) => ({ ...d, clients: [...d.clients, c] }));
    setDraft({ name: "", email: "", address: "" });
    setError("");
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Clients</h1>
      <div className={card + " grid gap-3 sm:grid-cols-2"}>
        <Field label="Name"><input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
        <Field label="Email"><input className={inputClass} type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
        <Field label="Address"><textarea className={inputClass} rows={2} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field>
        <div className="flex items-end"><button className={btnPrimary} onClick={add}>Add client</button></div>
        {error && <div role="alert" className="text-sm text-red-600 sm:col-span-2">{error}</div>}
      </div>
      {data.clients.length === 0 && <EmptyState text="No clients yet." />}
      {data.clients.map((c) => (
        <div key={c.id} className={card + " flex items-start justify-between gap-2"}>
          <div>
            <div className="font-medium">{c.name}</div>
            <div className="text-sm text-stone-500">{c.email}</div>
            <div className="whitespace-pre-line text-sm text-stone-500">{c.address}</div>
          </div>
          <button className={btnDanger} onClick={() => update((d) => ({ ...d, clients: d.clients.filter((x) => x.id !== c.id) }))}>Delete</button>
        </div>
      ))}
    </section>
  );
}

function ExpensesPanel({ data, update }: { data: AppData; update: (fn: (d: AppData) => AppData) => void }) {
  const [draft, setDraft] = useState({ date: todayISO(), description: "", category: EXPENSE_CATEGORIES[0] as string, amount: "" });
  const [error, setError] = useState("");

  function add() {
    const kobo = parseNairaToKobo(draft.amount);
    if (!draft.description.trim()) return setError("Add a description.");
    if (kobo === null || kobo <= 0) return setError("Enter a valid amount in naira.");
    const e: Expense = { id: newId(), date: draft.date, description: draft.description.trim(), category: draft.category as Expense["category"], amountKobo: kobo };
    update((d) => ({ ...d, expenses: [e, ...d.expenses] }));
    setDraft({ ...draft, description: "", amount: "" });
    setError("");
  }

  return (
    <section className="space-y-4">
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
        <div className="sm:col-span-2"><button className={btnPrimary} onClick={add}>Add expense</button></div>
        {error && <div role="alert" className="text-sm text-red-600 sm:col-span-2">{error}</div>}
      </div>
      {data.expenses.length === 0 && <EmptyState text="No expenses logged yet." />}
      {data.expenses.map((e) => (
        <div key={e.id} className={card + " flex items-center justify-between gap-2"}>
          <div>
            <div className="font-medium">{e.description}</div>
            <div className="text-sm text-stone-500">{formatDate(e.date)} · {e.category}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{formatNaira(e.amountKobo)}</span>
            <button className={btnDanger} onClick={() => update((d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== e.id) }))}>Delete</button>
          </div>
        </div>
      ))}
    </section>
  );
}
