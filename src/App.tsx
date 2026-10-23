import { useMemo, useState } from "react";
import { BankImportPanel } from "./components/BankImport";
import { ReceiptPanel } from "./components/Receipt";
import { TaxPanel } from "./components/Tax";
import { InvoiceForm } from "./components/InvoiceForm";
import { InvoiceView } from "./components/InvoiceView";
import { AskMyBooks } from "./components/AskMyBooks";
import { BudgetPanel } from "./components/Budgets";
import { ClientStatementView } from "./components/ClientStatement";
import { CategoryDonut, IncomeExpenseChart } from "./components/Charts";
import { EntriesPanel } from "./components/RecurringForm";
import { Badge, EmptyState, Field, StatCard, btnDanger, btnPrimary, btnSecondary, card, inputClass } from "./components/ui";
import { useAppData } from "./hooks/useAppData";
import { useTheme } from "./hooks/useTheme";
import { addMonths, daysBetween, formatDate, formatMonth, isOverdue, monthKey, todayISO } from "./lib/dates";
import { formatNaira, setDisplayFormat } from "./lib/money";
import { DEFAULT_FX, rateTable } from "./lib/fx";
import { paymentMethodLabel } from "./lib/labels";
import { categoryTotals, dashboardTotals, invoiceTotalKobo, monthlySummary } from "./lib/summary";
import { cloneTemplate, hasGeneratedFor, templatesDue } from "./lib/recurring";
import { saveLastExport, backupDue, daysSinceExport, loadLastExport } from "./lib/backup";
import { exportJSON, parseImport } from "./lib/storage";
import { PAYMENT_METHODS, type AppData, type Client, type FxRates, type Invoice, type PaymentMethod } from "./lib/types";
import { newId } from "./lib/ids";
import { loadSettings, saveSettings, type AssistantSettings } from "./lib/assistant/llm";
import { loadLogo, resizeImageFile, saveLogo } from "./lib/logo";

type Tab = "home" | "invoices" | "clients" | "expenses" | "monthly" | "tax" | "import" | "ask" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "invoices", label: "Invoices" },
  { id: "clients", label: "Clients" },
  { id: "expenses", label: "Expenses" },
  { id: "monthly", label: "Monthly" },
  { id: "tax", label: "Tax" },
  { id: "import", label: "Import" },
  { id: "ask", label: "Ask my books" },
  { id: "settings", label: "Settings" },
];

type Currency = "naira" | "naira-whole";
const PREFS_KEY = "mercureal-invoice:prefs";
interface Prefs { currency: Currency }
function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { currency: (JSON.parse(raw) as Prefs).currency === "naira-whole" ? "naira-whole" : "naira" };
  } catch { /* fall through */ }
  return { currency: "naira" };
}
function applyPrefs(p: Prefs) {
  setDisplayFormat(p.currency === "naira-whole" ? { symbol: "NGN ", wholeUnits: true } : { symbol: "₦", wholeUnits: false });
}

export default function App() {
  const { data, update, replace } = useAppData();
  const { theme, toggle } = useTheme();
  const [prefs, setPrefs] = useState<Prefs>(() => { const p = loadPrefs(); applyPrefs(p); return p; });
  const [settings, setSettings] = useState<AssistantSettings>(() => loadSettings());
  const [tab, setTab] = useState<Tab>("home");
  const [editing, setEditing] = useState<Invoice | "new" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "overdue">("all");
  const [importError, setImportError] = useState("");
  const [nowMs] = useState(() => Date.now());
  const lastExport = useMemo(() => loadLastExport(), []);
  const hasData = data.invoices.length + data.expenses.length + data.incomes.length + data.clients.length > 0;
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const showBackupBanner = backupDue(exportedAt ?? lastExport, nowMs, hasData);
  const daysSince = daysSinceExport(exportedAt ?? lastExport, nowMs);

  const today = todayISO();
  const month = monthKey(today);
  const totals = dashboardTotals(data, today);

  function changePrefs(p: Prefs) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    applyPrefs(p);
    setPrefs(p);
  }

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
    const stamp = new Date().toISOString();
    saveLastExport(stamp);
    setExportedAt(stamp);
  }

  function saveFxRates(next: FxRates) {
    update((d) => ({ ...d, fxRates: next }));
  }

  function generateTemplate(id: string) {
    const tpl = data.invoices.find((i) => i.id === id);
    if (!tpl) return;
    const monthStr = monthKey(today);
    if (hasGeneratedFor(data.invoices, id, monthStr)) return;
    const inv = cloneTemplate(tpl, data.invoices, today);
    update((d) => ({ ...d, invoices: [inv, ...d.invoices] }));
  }

  function toggleTemplate(id: string, on: boolean) {
    update((d) => ({ ...d, invoices: d.invoices.map((i) => (i.id === id ? { ...i, monthlyTemplate: on } : i)) }));
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
  const overdueCount = data.invoices.filter((i) => isOverdue(i.dueDate, i.status, today)).length;
  const visibleInvoices = filter === "overdue" ? data.invoices.filter((i) => isOverdue(i.dueDate, i.status, today)) : data.invoices;
  const summaryRows = monthlySummary(data);
  const chartRows = summaryRows.slice(0, 6).reverse();
  const cats = categoryTotals(data, [addMonths(month, -2), addMonths(month, -1), month]);

  return (
    <div className="app-bg min-h-screen text-stone-900 dark:text-stone-100">
      <header className="no-print sticky top-0 z-20 border-b border-white/30 bg-white/60 backdrop-blur-xl dark:border-white/10 dark:bg-stone-950/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="font-bold tracking-tight text-emerald-700 dark:text-emerald-300">MercuReal Invoice</div>
          <button className={btnSecondary} onClick={toggle} aria-label="Toggle dark mode">{theme === "dark" ? "Light mode" : "Dark mode"}</button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 pb-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setEditing(null); setViewing(null); }}
              className={`min-h-11 whitespace-nowrap rounded-xl px-4 text-sm transition ${tab === t.id ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30" : "text-stone-600 hover:bg-white/60 dark:text-stone-300 dark:hover:bg-white/10"}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 p-4">
        {showBackupBanner && (
          <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/60 bg-amber-50/80 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-950/40">
            <span>
              {daysSince === null ? "you have not exported a backup yet." : `it has been ${daysSince} days since your last backup.`} keep a copy of your data safe.
            </span>
            <button type="button" onClick={download} className="rounded-lg bg-stone-900 px-3 py-1.5 text-white dark:bg-white dark:text-stone-900">
              export backup
            </button>
          </div>
        )}
        {tab === "home" && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">This month, {formatMonth(month)}</h1>
              {overdueCount > 0 && <Badge tone="bad">{overdueCount} overdue</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <StatCard label="Invoiced" value={formatNaira(totals.invoicedKobo)} />
              <StatCard label="Paid" value={formatNaira(totals.paidKobo)} tone="good" />
              <StatCard label="Outstanding" value={formatNaira(totals.outstandingKobo)} tone={totals.outstandingKobo > 0 ? "bad" : undefined} />
              <StatCard label="Expenses" value={formatNaira(totals.expensesKobo)} />
              <StatCard label="Profit (cash)" value={formatNaira(totals.profitKobo)} tone={totals.profitKobo >= 0 ? "good" : "bad"} />
            </div>
            <p className="text-xs text-stone-500">Profit is payments and other income received this month minus expenses for this month. Recurring entries count every month they cover.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className={card}><h2 className="mb-2 font-semibold">Income vs expenses</h2><IncomeExpenseChart rows={chartRows} /></div>
              <div className={card}><h2 className="mb-2 font-semibold">Spending by category (last 3 months)</h2><CategoryDonut slices={cats.map((c) => ({ label: c.category, kobo: c.kobo }))} /></div>
            </div>
          </section>
        )}

        {tab === "invoices" && !editing && !viewingInv && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
              <div className="flex gap-2">
                <select className={inputClass + " !w-auto"} value={filter} onChange={(e) => setFilter(e.target.value as "all" | "overdue")} aria-label="Filter invoices">
                  <option value="all">All</option>
                  <option value="overdue">Overdue ({overdueCount})</option>
                </select>
                <button className={btnPrimary} onClick={() => setEditing("new")} disabled={data.clients.length === 0}>New invoice</button>
              </div>
            </div>
            {data.invoices.length === 0 && <EmptyState text="No invoices yet. Add a client, then create your first invoice." />}
            {visibleInvoices.length === 0 && data.invoices.length > 0 && <EmptyState text="No overdue invoices. Nice." />}
            {visibleInvoices.map((inv) => {
              const overdue = isOverdue(inv.dueDate, inv.status, today);
              return (
                <div key={inv.id} className={card}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 font-medium">{inv.number} · {clientName(inv.clientId)} {overdue && <Badge tone="bad">Overdue {daysBetween(inv.dueDate, today)}d</Badge>}</div>
                      <div className="text-sm text-stone-500">Due {formatDate(inv.dueDate)} · {formatNaira(invoiceTotalKobo(inv))}</div>
                      <div className="text-xs">
                        {inv.status === "paid" ? <span className="text-emerald-700 dark:text-emerald-400">Paid {inv.paidDate ? formatDate(inv.paidDate) : ""} via {paymentMethodLabel(inv.paymentMethod)}</span> : <span className="text-stone-500">Unpaid</span>}
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

        {tab === "tax" && <TaxPanel data={data} today={today} />}
        {tab === "import" && <div className="space-y-4"><BankImportPanel data={data} update={update} today={today} /><ReceiptPanel data={data} update={update} today={today} /></div>}
        {tab === "clients" && <ClientsPanel data={data} update={update} today={today} />}
        {tab === "expenses" && (
          <section className="space-y-6">
            <h1 className="text-2xl font-semibold tracking-tight">Expenses and income</h1>
            <EntriesPanel data={data} update={update} />
            <BudgetPanel data={data} month={month} update={update} />
          </section>
        )}

        {tab === "monthly" && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Recurring invoices</h2>
            <p className="text-sm text-stone-500">Mark an invoice as a monthly template, then generate it once per month.</p>
            {data.invoices.filter((i) => i.monthlyTemplate).length === 0 && <p className="text-sm">no templates yet. open an invoice and mark it as a monthly template.</p>}
            {templatesDue(data.invoices, monthKey(today)).length > 0 && (
              <p className="rounded-lg bg-amber-50 p-2 text-sm dark:bg-amber-950/40">{templatesDue(data.invoices, monthKey(today)).length} template(s) still need generating this month.</p>
            )}
            {data.invoices.filter((i) => i.monthlyTemplate).map((tpl) => {
              const done = hasGeneratedFor(data.invoices, tpl.id, monthKey(today));
              return (
                <div key={tpl.id} className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 p-2 text-sm dark:border-stone-700">
                  <span>{tpl.number} (template)</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => toggleTemplate(tpl.id, false)} className="rounded border px-2 py-1 text-xs">unmark</button>
                    <button type="button" disabled={done} onClick={() => generateTemplate(tpl.id)} className="rounded bg-stone-900 px-2 py-1 text-xs text-white disabled:opacity-40 dark:bg-white dark:text-stone-900">
                      {done ? "done this month" : "generate this month"}
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}
        {tab === "monthly" && (
          <section className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight">Monthly summary</h1>
            {summaryRows.length === 0 && <EmptyState text="Nothing logged yet." />}
            {summaryRows.map((r) => (
              <div key={r.month} className={card}>
                <div className="font-medium">{formatMonth(r.month)}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
                  <div>Invoiced<div className="font-semibold">{formatNaira(r.invoicedKobo)}</div></div>
                  <div>Paid<div className="font-semibold">{formatNaira(r.paidKobo)}</div></div>
                  <div>Other income<div className="font-semibold">{formatNaira(r.otherIncomeKobo)}</div></div>
                  <div>Expenses<div className="font-semibold">{formatNaira(r.expensesKobo)}</div></div>
                  <div>Profit (cash)<div className={`font-semibold ${r.profitKobo < 0 ? "text-red-600" : ""}`}>{formatNaira(r.profitKobo)}</div></div>
                </div>
              </div>
            ))}
          </section>
        )}

        {tab === "ask" && (
          <AskMyBooks data={data} today={today} settings={settings} onSettings={(s) => { saveSettings(s); setSettings(s); }} />
        )}

        {tab === "settings" && (
          <section className="space-y-4">
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <div className={card + " space-y-3"}>
              <h2 className="font-semibold">Currency format</h2>
              <Field label="Amount style">
                <select className={inputClass} value={prefs.currency} onChange={(e) => changePrefs({ currency: e.target.value as Currency })}>
                  <option value="naira">₦1,250.50 (kobo precision)</option>
                  <option value="naira-whole">NGN 1,251 (whole naira)</option>
                </select>
              </Field>
              <p className="text-xs text-stone-500">Display only. Stored amounts keep full kobo precision.</p>
            </div>
            <LogoSettings />
            <div className={card + " space-y-3"}>
              <h2 className="font-semibold">Naira rates for foreign invoices</h2>
              <p className="text-xs text-stone-500">Naira per 1 unit. Used for naira-equivalent totals and VAT reports. Update these when the rate moves.</p>
              <FxRatesEditor current={data.fxRates} onSave={saveFxRates} />
            </div>
            <div className={card + " space-y-3"}>
              <h2 className="font-semibold">Data</h2>
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

function FxRatesEditor({ current, onSave }: { current?: FxRates; onSave: (r: FxRates) => void }) {
  const effective = rateTable(current);
  const [draft, setDraft] = useState<Record<"USD" | "GBP" | "EUR", string>>({ USD: String(effective.USD), GBP: String(effective.GBP), EUR: String(effective.EUR) });
  const [msg, setMsg] = useState("");
  function save() {
    const next: FxRates = {};
    for (const c of ["USD", "GBP", "EUR"] as const) {
      const n = Number(draft[c]);
      if (!Number.isFinite(n) || n <= 0) return setMsg(`${c} rate must be a number above zero.`);
      next[c] = n;
    }
    onSave(next);
    setMsg("Saved.");
  }
  return (
    <div className="space-y-2">
      {(["USD", "GBP", "EUR"] as const).map((c) => (
        <Field key={c} label={`${c} to NGN (default ${DEFAULT_FX[c]})`}>
          <input className={inputClass} inputMode="decimal" value={draft[c]} onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.value }))} />
        </Field>
      ))}
      <div className="flex items-center gap-2">
        <button type="button" className={btnPrimary} onClick={save}>Save rates</button>
        {msg && <span className="text-sm text-stone-600">{msg}</span>}
      </div>
    </div>
  );
}

function ClientsPanel({ data, update, today }: { data: AppData; update: (fn: (d: AppData) => AppData) => void; today: string }) {
  const [draft, setDraft] = useState({ name: "", email: "", address: "" });
  const [error, setError] = useState("");
  const [statementFor, setStatementFor] = useState<string | null>(null);

  function add() {
    if (!draft.name.trim()) return setError("Name is required.");
    const c: Client = { id: newId(), name: draft.name.trim(), email: draft.email.trim(), address: draft.address.trim() };
    update((d) => ({ ...d, clients: [...d.clients, c] }));
    setDraft({ name: "", email: "", address: "" });
    setError("");
  }

  if (statementFor) {
    const c = data.clients.find((x) => x.id === statementFor);
    return (
      <section className="space-y-3">
        <button className={btnSecondary} onClick={() => setStatementFor(null)}>Back to clients</button>
        {c && <ClientStatementView data={data} today={today} />}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
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
          <div className="flex flex-col gap-2">
            <button className={btnSecondary} onClick={() => setStatementFor(c.id)}>Statement</button>
            <button className={btnDanger} onClick={() => update((d) => ({ ...d, clients: d.clients.filter((x) => x.id !== c.id) }))}>Delete</button>
          </div>
        </div>
      ))}
    </section>
  );
}


/** Upload, replace or remove the invoice logo. Stored as a resized PNG data URL in localStorage. */
function LogoSettings() {
  const [logo, setLogo] = useState<string | null>(() => loadLogo());
  const [msg, setMsg] = useState("");
  async function onPick(file: File) {
    setMsg("");
    try {
      const url = await resizeImageFile(file, 512);
      if (!saveLogo(url)) {
        setMsg("That logo is too large to store. Try a smaller image.");
        return;
      }
      setLogo(url);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not use that image.");
    }
  }
  function remove() {
    saveLogo(null);
    setLogo(null);
  }
  return (
    <div className={card + " space-y-3"}>
      <h2 className="font-semibold">Invoice logo</h2>
      <p className="text-xs text-stone-500">Shown at the top of printed and PDF invoices. Stored only in this browser.</p>
      {logo && <img src={logo} alt="Current invoice logo" className="h-16 w-16 rounded-full object-contain bg-white" />}
      <div className="flex flex-wrap gap-2">
        <label className={btnSecondary + " cursor-pointer"}>
          {logo ? "Replace logo" : "Upload logo"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Choose invoice logo" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
        </label>
        {logo && <button type="button" className={btnDanger} onClick={remove}>Remove logo</button>}
      </div>
      {msg && <div role="alert" className="text-sm text-red-600">{msg}</div>}
    </div>
  );
}
