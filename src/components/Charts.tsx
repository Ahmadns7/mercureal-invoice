import { formatMonthShort } from "../lib/dates";
import { formatNaira } from "../lib/money";
import type { MonthRow } from "../lib/summary";

const PALETTE = ["#10b981", "#38bdf8", "#f59e0b", "#f472b6", "#a78bfa", "#fb7185", "#34d399", "#94a3b8"];

/** Grouped bars: income (paid + other) vs expenses per month, oldest first. Pure SVG. */
export function IncomeExpenseChart({ rows }: { rows: MonthRow[] }) {
  const ordered = [...rows].reverse().slice(-12);
  if (ordered.length === 0) return <div className="text-sm text-stone-500">No months to chart yet.</div>;
  const values = ordered.flatMap((r) => [r.paidKobo + r.otherIncomeKobo, r.expensesKobo]);
  const max = Math.max(1, ...values);
  const W = 640;
  const H = 220;
  const pad = 28;
  const groupW = (W - pad * 2) / ordered.length;
  const barW = Math.max(4, Math.min(18, groupW / 3));
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Income versus expenses by month" className="h-auto w-full">
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={pad} x2={W - pad} y1={y(max * t)} y2={y(max * t)} className="stroke-stone-500/20" strokeDasharray="3 4" />
        ))}
        {ordered.map((r, i) => {
          const cx = pad + groupW * i + groupW / 2;
          const inc = r.paidKobo + r.otherIncomeKobo;
          return (
            <g key={r.month}>
              <rect x={cx - barW - 1} y={y(inc)} width={barW} height={Math.max(0, H - pad - y(inc))} rx={3} fill="#10b981">
                <title>{`${formatMonthShort(r.month)} income ${formatNaira(inc)}`}</title>
              </rect>
              <rect x={cx + 1} y={y(r.expensesKobo)} width={barW} height={Math.max(0, H - pad - y(r.expensesKobo))} rx={3} fill="#f43f5e">
                <title>{`${formatMonthShort(r.month)} expenses ${formatNaira(r.expensesKobo)}`}</title>
              </rect>
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-stone-500 text-[11px]">{formatMonthShort(r.month)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-stone-500 dark:text-stone-400">
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />Income</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-500" />Expenses</span>
      </figcaption>
    </figure>
  );
}

export interface DonutSlice {
  label: string;
  kobo: number;
}

/** Donut of expense categories. Pure SVG with a legend. */
export function CategoryDonut({ slices }: { slices: DonutSlice[] }) {
  const total = slices.reduce((s, x) => s + x.kobo, 0);
  if (total <= 0) return <div className="text-sm text-stone-500">No expenses to chart yet.</div>;
  const R = 70;
  const C = 2 * Math.PI * R;
  const offsets: number[] = [];
  slices.forEach((_s, i) => offsets.push(i === 0 ? 0 : offsets[i - 1] + (slices[i - 1].kobo / total) * C));
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <svg viewBox="0 0 200 200" role="img" aria-label="Expenses by category" className="h-40 w-40 shrink-0 -rotate-90">
        <circle cx="100" cy="100" r={R} fill="none" strokeWidth="28" className="stroke-stone-500/15" />
        {slices.map((s, i) => {
          const len = (s.kobo / total) * C;
          return (
            <circle key={s.label} cx="100" cy="100" r={R} fill="none" strokeWidth="28" stroke={PALETTE[i % PALETTE.length]}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offsets[i]}>
              <title>{`${s.label}: ${formatNaira(s.kobo)}`}</title>
            </circle>
          );
        })}
      </svg>
      <ul className="grid w-full min-w-0 flex-1 gap-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={s.label} className="flex min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-stone-500">{Math.round((s.kobo / total) * 100)}% · {formatNaira(s.kobo)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
