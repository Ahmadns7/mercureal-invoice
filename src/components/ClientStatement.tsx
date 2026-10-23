import { useState } from "react";
import { clientStatement, clientSummaries } from "../lib/statement";
import { formatDate } from "../lib/dates";
import { formatNaira } from "../lib/money";
import { paymentMethodLabel } from "../lib/labels";
import type { AppData } from "../lib/types";
import { Badge, card, EmptyState, StatCard } from "./ui";

/** Every invoice and payment per client, with totals. Pick a client to open their statement. */
export function ClientStatementView({ data, today }: { data: AppData; today: string }) {
  const [clientId, setClientId] = useState<string>("");
  const list = clientSummaries(data, today);
  if (data.clients.length === 0) return <EmptyState text="Add a client to see their statement." />;
  const st = clientId ? clientStatement(data, clientId, today) : null;

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Client statements</h1>
      <label className="block max-w-sm">
        <span className="mb-1 block text-sm font-medium text-stone-600 dark:text-stone-300">Client</span>
        <select className="w-full min-h-11 rounded-xl border border-stone-300/80 bg-white/80 px-3 text-base dark:border-white/10 dark:bg-white/5" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Choose a client…</option>
          {list.map((c) => <option key={c.clientId} value={c.clientId}>{c.name}</option>)}
        </select>
      </label>

      {!st && (
        <div className="space-y-2">
          {list.map((c) => (
            <button key={c.clientId} onClick={() => setClientId(c.clientId)} className={card + " flex w-full items-center justify-between gap-2 text-left"}>
              <span className="min-w-0 truncate font-medium">{c.name}</span>
              <span className="flex shrink-0 items-center gap-2 text-sm">
                {c.overdueCount > 0 && <Badge tone="bad">{c.overdueCount} overdue</Badge>}
                <span className="tabular-nums">{formatNaira(c.outstandingKobo)} owed</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {st && (
        <div className="space-y-3">
          <div className={card}>
            <div className="text-lg font-semibold">{st.client.name}</div>
            <div className="text-sm text-stone-500 dark:text-stone-400">{[st.client.email, st.client.address].filter(Boolean).join(" · ") || "No contact details"}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Billed" value={formatNaira(st.billedKobo)} />
            <StatCard label="Paid" value={formatNaira(st.paidKobo)} tone="good" />
            <StatCard label="Outstanding" value={formatNaira(st.outstandingKobo)} tone={st.outstandingKobo > 0 ? "bad" : undefined} />
            <StatCard label="Overdue" value={formatNaira(st.overdueKobo)} tone={st.overdueKobo > 0 ? "bad" : undefined} />
          </div>
          {st.rows.length === 0 && <EmptyState text="No invoices for this client yet." />}
          {st.rows.map((r) => (
            <div key={r.id} className={card + " flex flex-wrap items-center justify-between gap-2"}>
              <div className="min-w-0">
                <div className="font-medium">{r.number}</div>
                <div className="text-sm text-stone-500 dark:text-stone-400">
                  Issued {formatDate(r.issueDate)} · due {formatDate(r.dueDate)}
                  {r.status === "paid" && r.paidDate ? ` · paid ${formatDate(r.paidDate)} via ${paymentMethodLabel(r.paymentMethod)}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {r.status === "paid" ? <Badge tone="good">Paid</Badge> : r.overdue ? <Badge tone="bad">Overdue</Badge> : <Badge tone="warn">Unpaid</Badge>}
                <span className="font-semibold tabular-nums">{formatNaira(r.totalKobo)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
