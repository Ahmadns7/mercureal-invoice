/** Backup reminder: nag gently after 30 days without a JSON export. Stored separately from the data. */
export const LAST_EXPORT_KEY = "mercureal-invoice:lastExport";
export const BACKUP_NAG_DAYS = 30;

export function loadLastExport(storage: Storage = localStorage): string | null {
  try {
    const raw = storage.getItem(LAST_EXPORT_KEY);
    return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
  } catch {
    return null;
  }
}

export function saveLastExport(iso: string, storage: Storage = localStorage): void {
  storage.setItem(LAST_EXPORT_KEY, iso);
}

/**
 * Show the banner when there is data and either no export was ever recorded,
 * or the last export is 30 or more days old.
 */
export function backupDue(lastExportIso: string | null, nowMs: number, hasData: boolean): boolean {
  if (!hasData) return false;
  if (!lastExportIso) return true;
  return nowMs - Date.parse(lastExportIso) >= BACKUP_NAG_DAYS * 86400000;
}

/** Whole days since the last export, or null if never exported. */
export function daysSinceExport(lastExportIso: string | null, nowMs: number): number | null {
  if (!lastExportIso) return null;
  return Math.floor((nowMs - Date.parse(lastExportIso)) / 86400000);
}
