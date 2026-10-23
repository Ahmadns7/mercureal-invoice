/** Next invoice number for a year: INV-YYYY-NNN, restarting at 001 each year. */
export function nextInvoiceNumber(existingNumbers: string[], year: number): string {
  const prefix = `INV-${year}-`;
  let max = 0;
  for (const n of existingNumbers) {
    if (n.startsWith(prefix)) {
      const seq = Number(n.slice(prefix.length));
      if (Number.isInteger(seq) && seq > max) max = seq;
    }
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
