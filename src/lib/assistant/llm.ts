import type { FinanceSummary } from "./context";
import { buildSystemPrompt } from "./context";

export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  keyHint: string;
}

/** OpenAI-compatible chat endpoints. Users paste their own key. */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: "groq", label: "Groq (free tier)", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", keyHint: "gsk_..." },
  { id: "gemini", label: "Google Gemini (free tier)", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash", keyHint: "AIza..." },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free", keyHint: "sk-or-..." },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", keyHint: "sk-..." },
  { id: "custom", label: "Custom OpenAI-compatible", baseUrl: "", model: "", keyHint: "your key" },
];

export interface AssistantSettings {
  providerId: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export const ASSISTANT_STORAGE_KEY = "mercureal-invoice:assistant";

export function defaultSettings(): AssistantSettings {
  const p = PROVIDER_PRESETS[0];
  return { providerId: p.id, baseUrl: p.baseUrl, model: p.model, apiKey: "" };
}

export function presetFor(id: string): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === id) ?? PROVIDER_PRESETS[0];
}

export function loadSettings(storage: Storage = localStorage): AssistantSettings {
  try {
    const raw = storage.getItem(ASSISTANT_STORAGE_KEY);
    if (!raw) return defaultSettings();
    const s = JSON.parse(raw) as Partial<AssistantSettings>;
    const base = defaultSettings();
    return {
      providerId: typeof s.providerId === "string" ? s.providerId : base.providerId,
      baseUrl: typeof s.baseUrl === "string" ? s.baseUrl : base.baseUrl,
      model: typeof s.model === "string" ? s.model : base.model,
      apiKey: typeof s.apiKey === "string" ? s.apiKey : "",
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: AssistantSettings, storage: Storage = localStorage): void {
  storage.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify(s));
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Request body for an OpenAI-compatible streaming chat call. Pure, so it can be tested without the network. */
export function buildChatRequest(summary: FinanceSummary, history: ChatMessage[], model: string) {
  const recent = history.slice(-12).map((m) => ({ role: m.role, content: m.content }));
  return {
    model,
    stream: true,
    temperature: 0.3,
    messages: [{ role: "system", content: buildSystemPrompt(summary) }, ...recent],
  };
}

/** Parse one SSE line from an OpenAI-compatible stream. Returns the text delta, "" for non-content lines, or null at end. */
export function parseSSELine(line: string): string | null {
  const t = line.trim();
  if (!t.startsWith("data:")) return "";
  const payload = t.slice(5).trim();
  if (payload === "[DONE]") return null;
  try {
    const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
    return json.choices?.[0]?.delta?.content ?? "";
  } catch {
    return "";
  }
}

/** Stream a reply. Calls onDelta with each text piece. Throws a readable error on HTTP failure. */
export async function streamChat(opts: {
  settings: AssistantSettings;
  summary: FinanceSummary;
  history: ChatMessage[];
  onDelta: (text: string) => void;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const { settings, summary, history, onDelta, signal } = opts;
  const doFetch = opts.fetchImpl ?? fetch;
  const base = settings.baseUrl.replace(/\/+$/, "");
  if (!base) throw new Error("Set the API base URL in the assistant settings.");
  if (!settings.apiKey.trim()) throw new Error("Add your API key in the assistant settings.");
  const res = await doFetch(`${base}/chat/completions`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey.trim()}` },
    body: JSON.stringify(buildChatRequest(summary, history, settings.model)),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`The model returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      const delta = parseSSELine(line);
      if (delta === null) return;
      if (delta) onDelta(delta);
    }
  }
  const rest = parseSSELine(buffer);
  if (rest) onDelta(rest);
}
