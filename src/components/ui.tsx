import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 focus:border-emerald-600 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100";
export const labelClass = "mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300";
export const btnPrimary =
  "rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50";
export const btnSecondary =
  "rounded-lg border border-stone-300 px-4 py-2 font-medium text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-100 dark:hover:bg-stone-800";
export const btnDanger = "rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950";
export const card = "rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export function StatCard({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const color = tone === "bad" ? "text-red-600 dark:text-red-400" : tone === "good" ? "text-emerald-700 dark:text-emerald-400" : "text-stone-900 dark:text-stone-100";
  return (
    <div className={card}>
      <div className="text-xs uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-700">{text}</div>;
}

type Tone = "neutral" | "good" | "warn" | "bad";
const toneClass: Record<Tone, string> = {
  neutral: "bg-stone-500/15 text-stone-700 dark:text-stone-300",
  good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  bad: "bg-red-500/15 text-red-700 dark:text-red-300",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${toneClass[tone]}`}>{children}</span>;
}

/** Horizontal progress bar. `ratio` is 0..n; bars over 1 turn red and cap at full width. */
export function ProgressBar({ ratio, label }: { ratio: number; label: string }) {
  const pct = Math.max(0, Math.min(100, ratio * 100));
  const color = ratio > 1 ? "bg-red-500" : ratio > 0.8 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
      className="h-2 w-full overflow-hidden rounded-full bg-stone-500/20">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
