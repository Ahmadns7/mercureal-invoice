import { useMemo, useRef, useState } from "react";
import { buildFinanceSummary, STARTER_QUESTIONS } from "../lib/assistant/context";
import { PROVIDER_PRESETS, presetFor, streamChat, saveSettings, type AssistantSettings, type ChatMessage } from "../lib/assistant/llm";
import type { AppData } from "../lib/types";
import { btnPrimary, btnSecondary, card, Field, inputClass } from "./ui";

interface Props {
  data: AppData;
  today: string;
  settings: AssistantSettings;
  onSettings: (s: AssistantSettings) => void;
}

/** Chat panel. The model only ever receives the summary built from the user's books. */
export function AskMyBooks({ data, today, settings, onSettings }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(!settings.apiKey);
  const abortRef = useRef<AbortController | null>(null);
  const preset = presetFor(settings.providerId);
  const summary = useMemo(() => buildFinanceSummary(data, today), [data, today]);

  function updateSettings(patch: Partial<AssistantSettings>) {
    const next = { ...settings, ...patch };
    saveSettings(next);
    onSettings(next);
  }

  function pickProvider(id: string) {
    const p = presetFor(id);
    updateSettings({ providerId: id, baseUrl: p.baseUrl, model: p.model });
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError("");
    const history: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamChat({
        settings,
        summary,
        history,
        signal: ctrl.signal,
        onDelta: (text) =>
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, content: last.content + text };
            return copy;
          }),
      });
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages((m) => (m[m.length - 1]?.content === "" ? m.slice(0, -1) : m));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Ask my books</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">Ask about your expenses, profit or clients. Only a summary of your numbers is sent, never your API key.</p>
        </div>
        <button className={btnSecondary} onClick={() => setShowSettings((v) => !v)}>{showSettings ? "Hide settings" : "AI settings"}</button>
      </div>

      {showSettings && (
        <div className={card + " grid gap-3 sm:grid-cols-2"}>
          <Field label="Provider">
            <select className={inputClass} value={settings.providerId} onChange={(e) => pickProvider(e.target.value)}>
              {PROVIDER_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Model">
            <input className={inputClass} value={settings.model} onChange={(e) => updateSettings({ model: e.target.value })} />
          </Field>
          <Field label="Base URL (OpenAI-compatible)">
            <input className={inputClass} value={settings.baseUrl} onChange={(e) => updateSettings({ baseUrl: e.target.value })} placeholder="https://…/v1" />
          </Field>
          <Field label="API key">
            <input className={inputClass} type="password" autoComplete="off" value={settings.apiKey} placeholder={preset.keyHint} onChange={(e) => updateSettings({ apiKey: e.target.value })} />
          </Field>
          <p className="text-xs text-stone-500 sm:col-span-2 dark:text-stone-400">
            Your key is stored only in this browser (localStorage) and sent only to the base URL above. The assistant sees a numbers-only summary of your books.
          </p>
        </div>
      )}

      <div className={card + " flex min-h-[320px] flex-col gap-3"} aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-stone-500 dark:text-stone-400">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {STARTER_QUESTIONS.map((q) => (
                <button key={q} className={btnSecondary + " text-sm"} disabled={busy} onClick={() => ask(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-emerald-600 px-4 py-2 text-white" : "mr-auto max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-stone-500/10 px-4 py-2 text-stone-900 dark:text-stone-100"}>
            {m.content || (busy && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
        {error && <div role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</div>}
      </div>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <input className={inputClass} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your money…" aria-label="Question" />
        {busy ? (
          <button type="button" className={btnSecondary} onClick={() => abortRef.current?.abort()}>Stop</button>
        ) : (
          <button className={btnPrimary} disabled={!input.trim()}>Send</button>
        )}
      </form>
    </section>
  );
}
