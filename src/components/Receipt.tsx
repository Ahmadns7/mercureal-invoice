import { useState } from "react";
import type { AppData, ExpenseCategory } from "../lib/types";
import { EXPENSE_CATEGORIES } from "../lib/types";
import { parseReceiptJson, manualAmount, RECEIPT_PROMPT, type ReceiptFields } from "../lib/receipt";
import { newId } from "../lib/ids";
import { loadSettings } from "../lib/assistant/llm";

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  today: string;
}

/**
 * Receipt capture. Takes a photo or picked image, asks the "Ask my books" provider's vision model
 * (if a key exists) for fields, then pre-fills an expense for the user to confirm. Never auto-saves.
 * The image is only kept if it is small enough to store; otherwise it is discarded after parsing.
 */
export function ReceiptPanel({ update, today }: Props) {
  const [draft, setDraft] = useState<ReceiptFields | null>(null);
  const [amountText, setAmountText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageKept, setImageKept] = useState(false);

  const cfg = readAskConfig();

  async function onFile(file: File) {
    setStatus("");
    setDraft(null);
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const keep = dataUrl.length <= MAX_IMAGE_CHARS;
      setImageKept(keep);
      if (!cfg) {
        setStatus("no 'Ask my books' key, so enter the amount manually from the photo.");
        setDraft({ vendor: "", amountKobo: null, date: today, category: "Other", currency: "NGN" });
        return;
      }
      const fields = await askVision(cfg, dataUrl);
      if (!fields) {
        setStatus("couldn't read the receipt automatically. enter the details manually.");
        setDraft({ vendor: "", amountKobo: null, date: today, category: "Other", currency: "NGN" });
      } else {
        setDraft(fields);
        setAmountText(fields.amountKobo != null ? String(fields.amountKobo / 100) : "");
      }
    } catch {
      setStatus("could not read that image. enter the details manually.");
      setDraft({ vendor: "", amountKobo: null, date: today, category: "Other", currency: "NGN" });
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!draft) return;
    const kobo = manualAmount(amountText) ?? draft.amountKobo;
    if (!kobo || kobo <= 0) {
      setStatus("enter the amount before saving.");
      return;
    }
    update((d) => ({
      ...d,
      expenses: [
        { id: newId(), date: draft.date ?? today, category: draft.category, description: draft.vendor || "receipt", amountKobo: kobo },
        ...d.expenses,
      ],
    }));
    setDraft(null);
    setAmountText("");
    setStatus("expense saved.");
  }

  return (
    <section className="space-y-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
      <h2 className="text-lg font-semibold">Scan a receipt</h2>
      <input type="file" accept="image/*" capture="environment" aria-label="Choose receipt photo" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="text-sm" />
      {busy && <p className="text-sm text-stone-500">reading receipt...</p>}
      {status && <p className="text-sm">{status}</p>}
      {draft && (
        <div className="space-y-2 text-sm">
          <p className="text-xs text-stone-500">{imageKept ? "photo kept locally." : "photo too large to keep, discarded after parse."} Check the fields before saving.</p>
          <label className="block">Vendor <input className="mt-1 w-full rounded border border-stone-300 bg-transparent px-2 py-1 dark:border-stone-600" value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} /></label>
          <label className="block">Amount (naira) <input inputMode="decimal" className="mt-1 w-full rounded border border-stone-300 bg-transparent px-2 py-1 dark:border-stone-600" value={amountText} onChange={(e) => setAmountText(e.target.value)} /></label>
          <label className="block">Date <input type="date" className="mt-1 w-full rounded border border-stone-300 bg-transparent px-2 py-1 dark:border-stone-600" value={draft.date ?? today} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
          <label className="block">Category
            <select className="mt-1 w-full rounded border border-stone-300 bg-transparent px-2 py-1 dark:border-stone-600" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ExpenseCategory })}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {draft.currency !== "NGN" && <p className="text-xs text-stone-500">receipt looks like {draft.currency}. enter the naira amount you paid.</p>}
          <button type="button" onClick={save} className="rounded-lg bg-stone-900 px-3 py-2 text-white dark:bg-white dark:text-stone-900">Save expense</button>
        </div>
      )}
    </section>
  );
}

/** Keep stored images only up to ~250KB of base64 so the localStorage budget is not exhausted. */
const MAX_IMAGE_CHARS = 250_000;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

interface AskConfig { baseUrl: string; apiKey: string; model: string }

/** Read the "Ask my books" provider config from its saved settings. Returns null when no key is set. */
function readAskConfig(): AskConfig | null {
  const s = loadSettings();
  if (!s.apiKey.trim() || !s.baseUrl.trim() || !s.model.trim()) return null;
  return { baseUrl: s.baseUrl, apiKey: s.apiKey.trim(), model: s.model };
}

async function askVision(cfg: AskConfig, dataUrl: string): Promise<ReceiptFields | null> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "user", content: [{ type: "text", text: RECEIPT_PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] }],
      temperature: 0,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return parseReceiptJson(json.choices?.[0]?.message?.content ?? "");
}

