import { formatDate } from "../lib/dates";
import { formatNaira, invoiceTotals, lineTotalKobo, VAT_PERCENT_LABEL } from "../lib/money";
import { paymentMethodLabel } from "../lib/labels";
import type { AppData, Invoice } from "../lib/types";

export function InvoiceView({ invoice, data }: { invoice: Invoice; data: AppData }) {
  const client = data.clients.find((c) => c.id === invoice.clientId);
  const totals = invoiceTotals(invoice.items, invoice.withVat);
  return (
    <div id="print-area" className="rounded-xl bg-white p-6 text-stone-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">INVOICE</h2>
          <div className="text-sm text-stone-600">{invoice.number}</div>
        </div>
        <div className="text-right text-sm text-stone-600">
          <div>Issued: {formatDate(invoice.issueDate)}</div>
          <div>Due: {formatDate(invoice.dueDate)}</div>
          {invoice.status === "paid" && invoice.paidDate && (
            <div>Paid {formatDate(invoice.paidDate)} via {paymentMethodLabel(invoice.paymentMethod)}</div>
          )}
        </div>
      </div>
      <div className="mt-6">
        <div className="text-xs uppercase text-stone-500">Bill to</div>
        <div className="font-medium">{client?.name ?? "Unknown client"}</div>
        {client?.email && <div className="text-sm">{client.email}</div>}
        {client?.address && <div className="whitespace-pre-line text-sm">{client.address}</div>}
      </div>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-stone-300 text-left">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((i) => (
            <tr key={i.id} className="border-b border-stone-100">
              <td className="py-2">{i.description}</td>
              <td className="py-2 text-right">{i.quantity}</td>
              <td className="py-2 text-right">{formatNaira(i.unitPriceKobo)}</td>
              <td className="py-2 text-right">{formatNaira(lineTotalKobo(i.quantity, i.unitPriceKobo))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-4 w-64 space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatNaira(totals.subtotalKobo)}</span></div>
        {invoice.withVat && (
          <div className="flex justify-between"><span>VAT ({VAT_PERCENT_LABEL})</span><span>{formatNaira(totals.vatKobo)}</span></div>
        )}
        <div className="flex justify-between border-t border-stone-300 pt-1 font-semibold">
          <span>Total</span><span>{formatNaira(totals.totalKobo)}</span>
        </div>
      </div>
      {invoice.notes && <div className="mt-6 whitespace-pre-line text-sm text-stone-700">{invoice.notes}</div>}
    </div>
  );
}
