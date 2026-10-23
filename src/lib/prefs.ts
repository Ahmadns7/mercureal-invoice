import { setDisplayFormat } from "./money";

export const PREFS_KEY = "mercureal-invoice:prefs";

export interface Prefs {
  symbol: "₦" | "NGN " | "N";
  wholeUnits: boolean;
}

export const DEFAULT_PREFS: Prefs = { symbol: "₦", wholeUnits: false };

export function loadPrefs(storage: Storage = localStorage): Prefs {
  try {
    const raw = storage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    const symbol = p.symbol === "NGN " || p.symbol === "N" ? p.symbol : "₦";
    return { symbol, wholeUnits: p.wholeUnits === true };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Save and apply display preferences. Storage stays integer kobo, so this only changes how amounts look. */
export function applyPrefs(p: Prefs, storage: Storage = localStorage): void {
  storage.setItem(PREFS_KEY, JSON.stringify(p));
  setDisplayFormat({ symbol: p.symbol, wholeUnits: p.wholeUnits });
}
