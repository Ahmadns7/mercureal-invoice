import { useState, type FormEvent } from "react";
import { btnPrimary, btnSecondary, Field, inputClass } from "./ui";
import { newId } from "../lib/ids";
import { nextInvoiceNumber } from "../lib/invoiceNumber";
import { parseNairaToKobo, parseQuantity } from "../lib/money";
import { CURRENCIES, PAYMENT_METHODS, type AppData, type Currency, type Invoice, type LineItem } from "../lib/types";
import { validatePaymentLink } from "../lib/receipt";
import { paymentMethodLabel } from "../lib/labels";
import { todayISO } from "../lib/dates";

interface Props {
  data: AppData;
  initial?: Invoice;
  onSave: (inv: Invoice) => void;
  onCancel: () => void;
}

interface Row { id: string; description: string; quantity: string; unit: string }

export function InvoiceForm({ data, initial, onSave, onCancel }: Props) {
  const today = todayISO();
  const [clientId, setClientId] = useState(initial?.clientId ?? data.clients[0]?.id ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? today);
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? today);
  const [withVat, setWithVat] = useState(initial?.withVat ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [rows, setRows] = useState<Row[]>(
    initial?.items.map((i) => ({ id: i.id, description: i.description, quantity: String(i.quantity), unit: String(i.unitPriceKobo / 100) })) ??
      [{ id: newId(), description: "", quantity: "1", unit: "" }],
  );
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "NGN");
  const [paymentLink, setPaymentLink] = useState(initial?.paymentLink ?? "");
  const [monthlyTemplate, setMonthlyTemplate] = useState(initial?.monthlyTemplate ?? false);
  const [error, setError] = useState("");

  function setRow(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!clientId) return setError("Add a client first.");
    if (!issueDate || !dueDate) return setError("Set issue and due dates.");
    const items: LineItem[] = [];
    for (const r of rows) {
      const q = parseQuantity(r.quantity);
      const u = parseNairaToKobo(r.unit);
      if (!r.description.trim()) return setError("Every line needs a description.");
      if (q === null) return setError(`Quantity for "${r.description}" must be above zero.`);
      if (u === null) return setError(`Price for "${r.description}" is not a valid naira amount.`);
      items.push({ id: r.id, description: r.description.trim(), quantity: q, unitPriceKobo: u });
    }
    if (items.length === 0) return setError("Add at least one line.");
    const link = validatePaymentLink(paymentLink);
    if (!link.ok) return setError(link.error);
    const number = initial?.number ?? nextInvoiceNumber(data.invoices.map((i) => i.number), Number(issueDate.slice(0, 4)));
    onSave({
      id: initial?.id ?? newId(),
      number,
      clientId,
      issueDate,
      dueDate,
      items,
      withVat,
      status: initial?.status ?? "unpaid",
      paidDate: initial?.paidDate,
      paymentMethod: initial?.paymentMethod,
      notes,
      currency,
      paymentLink: link.value || undefined,
      monthlyTemplate: monthlyTemplate || undefined,
      generatedFrom: initial?.generatedFrom,
    });
  }

  if (data.clients.length === 0) {
    return <div className="text-sm text-stone-600 dark:text-stone-300">Add a client in the Clients tab before creating an invoice.<div className="mt-3"><button className={btnSecondary} onClick={onCancel}>Back</button></div></div>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Client">
        <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
          {data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Issue date"><input type="date" className={inputClass} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></Field>
        <Field label="Due date"><input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Line items</div>
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-12 gap-2">
            <input className={`${inputClass} col-span-12 sm:col-span-6`} placeholder="Description" value={r.description} onChange={(e) => setRow(r.id, { description: e.target.value })} />
            <input className={`${inputClass} col-span-4 sm:col-span-2`} inputMode="decimal" placeholder="Qty" value={r.quantity} onChange={(e) => setRow(r.id, { quantity: e.target.value })} />
            <input className={`${inputClass} col-span-6 sm:col-span-3`} inputMode="decimal" placeholder="₦ unit price" value={r.unit} onChange={(e) => setRow(r.id, { unit: e.target.value })} />
            <button type="button" className="col-span-2 sm:col-span-1 text-sm text-red-600" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : rs))}>×</button>
          </div>
        ))}
        <button type="button" className={btnSecondary} onClick={() => setRows((rs) => [...rs, { id: newId(), description: "", quantity: "1", unit: "" }])}>+ Add line</button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={withVat} onChange={(e) => setWithVat(e.target.checked)} /> Add VAT (7.5%)
      </label>
      <Field label="Currency">
        <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <p className="text-xs text-stone-500">Enter unit prices in the invoice currency. Naira equivalents use the rates in Settings.</p>
      <Field label="Payment link (optional, Paystack or Flutterwave)">
        <input className={inputClass} inputMode="url" placeholder="https://paystack.com/pay/..." value={paymentLink} onChange={(e) => setPaymentLink(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={monthlyTemplate} onChange={(e) => setMonthlyTemplate(e.target.checked)} /> Monthly template (generate a copy each month)
      </label>
      <Field label="Notes (optional)">
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <div role="alert" className="text-sm text-red-600">{error}</div>}
      <div className="flex gap-2">
        <button className={btnPrimary} type="submit">Save invoice</button>
        <button className={btnSecondary} type="button" onClick={onCancel}>Cancel</button>
      </div>
      <p className="text-xs text-stone-500">Payment methods: {PAYMENT_METHODS.map(paymentMethodLabel).join(", ")}. Set when you mark an invoice paid.</p>
    </form>
  );
}
